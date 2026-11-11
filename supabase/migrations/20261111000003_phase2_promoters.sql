-- =============================================================================
-- AutoPromo — Phase 2: promoters, promotion requests, referral links & clicks
-- =============================================================================

-- Promoter agreement acceptance (self-service)
alter table public.profiles add column promoter_agreement_at timestamptz;
grant update (promoter_agreement_at) on public.profiles to authenticated;

create type public.promotion_request_status as enum ('pending', 'approved', 'rejected', 'cancelled');

-- -----------------------------------------------------------------------------
-- promotion_requests: a promoter asks the owner to promote a car
-- -----------------------------------------------------------------------------
create table public.promotion_requests (
  id           uuid primary key default gen_random_uuid(),
  car_id       uuid not null references public.cars (id) on delete cascade,
  promoter_id  uuid not null references public.profiles (id) on delete cascade,
  status       public.promotion_request_status not null default 'pending',
  message      text check (char_length(message) <= 500),
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  unique (car_id, promoter_id)
);

create index idx_promotion_requests_promoter on public.promotion_requests (promoter_id, status);
create index idx_promotion_requests_car on public.promotion_requests (car_id, status);

alter table public.promotion_requests enable row level security;

create policy "Promoter, car owner and admins see requests"
  on public.promotion_requests for select
  using (
    promoter_id = auth.uid()
    or exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid())
    or public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- promotions: an approved promoter + car pair with a unique referral code
-- -----------------------------------------------------------------------------
create table public.promotions (
  id             uuid primary key default gen_random_uuid(),
  car_id         uuid not null references public.cars (id) on delete cascade,
  promoter_id    uuid not null references public.profiles (id) on delete cascade,
  referral_code  text not null unique check (referral_code ~ '^[A-Za-z0-9]{6,16}$'),
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  ended_at       timestamptz,
  unique (car_id, promoter_id)
);

create index idx_promotions_promoter on public.promotions (promoter_id, active);
create index idx_promotions_car on public.promotions (car_id, active);

alter table public.promotions enable row level security;

create policy "Promoter, car owner and admins see promotions"
  on public.promotions for select
  using (
    promoter_id = auth.uid()
    or exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid())
    or public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- referral_clicks: visits that arrived through a promoter link
-- -----------------------------------------------------------------------------
create table public.referral_clicks (
  id            bigint generated always as identity primary key,
  promotion_id  uuid not null references public.promotions (id) on delete cascade,
  car_id        uuid not null references public.cars (id) on delete cascade,
  visitor_id    text not null check (char_length(visitor_id) between 8 and 64),
  user_id       uuid references auth.users (id) on delete set null,
  referrer      text check (char_length(referrer) <= 500),
  created_at    timestamptz not null default now()
);

create index idx_referral_clicks_promotion on public.referral_clicks (promotion_id, created_at desc);
create index idx_referral_clicks_dedupe on public.referral_clicks (promotion_id, visitor_id, created_at desc);

alter table public.referral_clicks enable row level security;

create policy "Promoter, car owner and admins see clicks"
  on public.referral_clicks for select
  using (
    exists (select 1 from public.promotions p where p.id = promotion_id and p.promoter_id = auth.uid())
    or exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid())
    or public.is_admin()
  );

-- No direct writes from the browser: everything goes through the RPCs below.
revoke all on public.promotion_requests, public.promotions, public.referral_clicks from anon;
revoke insert, update, delete on public.promotion_requests, public.promotions, public.referral_clicks from authenticated;
grant select on public.promotion_requests, public.promotions, public.referral_clicks to authenticated;

-- -----------------------------------------------------------------------------
-- Helpers
-- -----------------------------------------------------------------------------
create or replace function public.generate_referral_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.promotions where referral_code = code);
  end loop;
  return code;
end;
$$;

revoke execute on function public.generate_referral_code() from public, anon, authenticated;

-- Creates (or re-activates) the promotion for an approved request.
create or replace function public.activate_promotion(p_car_id uuid, p_promoter_id uuid)
returns public.promotions
language plpgsql
security definer
set search_path = ''
as $$
declare
  result public.promotions;
begin
  insert into public.promotions (car_id, promoter_id, referral_code)
  values (p_car_id, p_promoter_id, public.generate_referral_code())
  on conflict (car_id, promoter_id) do update set active = true, ended_at = null
  returning * into result;
  return result;
end;
$$;

revoke execute on function public.activate_promotion(uuid, uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RPC: request_promotion — promoter asks to promote a car.
-- Auto-approves when the owner allows any verified promoter.
-- -----------------------------------------------------------------------------
create or replace function public.request_promotion(p_car_id uuid, p_message text default null)
returns public.promotion_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  car public.cars;
  req public.promotion_requests;
  auto_approve boolean;
begin
  if auth.uid() is null then
    raise exception 'Please sign in first.' using errcode = 'P0001';
  end if;

  select * into me from public.profiles where id = auth.uid();
  if not me.is_promoter or me.promoter_agreement_at is null then
    raise exception 'Accept the Promoter Agreement before requesting cars.' using errcode = 'P0001';
  end if;
  if me.suspended then
    raise exception 'Your account is suspended.' using errcode = 'P0001';
  end if;

  select * into car from public.cars where id = p_car_id;
  if car.id is null or car.status <> 'active' then
    raise exception 'This car is not available for promotion.' using errcode = 'P0001';
  end if;
  if car.owner_id = auth.uid() then
    raise exception 'You cannot promote your own car.' using errcode = 'P0001';
  end if;

  select * into req from public.promotion_requests where car_id = p_car_id and promoter_id = auth.uid();
  if req.id is not null and req.status in ('pending', 'approved') then
    return req;
  end if;
  if req.id is not null and req.status = 'rejected' then
    raise exception 'The owner declined your previous request for this car.' using errcode = 'P0001';
  end if;

  auto_approve := car.allow_any_verified_promoter and me.identity_verified;

  insert into public.promotion_requests (car_id, promoter_id, status, message, decided_at)
  values (p_car_id, auth.uid(),
          case when auto_approve then 'approved'::public.promotion_request_status else 'pending' end,
          nullif(trim(p_message), ''),
          case when auto_approve then now() end)
  on conflict (car_id, promoter_id) do update
    set status = excluded.status, message = excluded.message, created_at = now(), decided_at = excluded.decided_at
  returning * into req;

  if auto_approve then
    perform public.activate_promotion(p_car_id, auth.uid());
  end if;

  return req;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: decide_promotion_request — owner approves or rejects
-- -----------------------------------------------------------------------------
create or replace function public.decide_promotion_request(p_request_id uuid, p_approve boolean)
returns public.promotion_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.promotion_requests;
begin
  select r.* into req
    from public.promotion_requests r
    join public.cars c on c.id = r.car_id
   where r.id = p_request_id and c.owner_id = auth.uid();

  if req.id is null then
    raise exception 'Request not found.' using errcode = 'P0001';
  end if;
  if req.status <> 'pending' then
    raise exception 'This request was already %.', req.status using errcode = 'P0001';
  end if;

  update public.promotion_requests
     set status = case when p_approve then 'approved'::public.promotion_request_status else 'rejected' end,
         decided_at = now()
   where id = p_request_id
  returning * into req;

  if p_approve then
    perform public.activate_promotion(req.car_id, req.promoter_id);
  end if;

  return req;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: end_promotion — promoter stops promoting, or owner removes a promoter
-- -----------------------------------------------------------------------------
create or replace function public.end_promotion(p_promotion_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  promo public.promotions;
begin
  select p.* into promo
    from public.promotions p
    join public.cars c on c.id = p.car_id
   where p.id = p_promotion_id
     and (p.promoter_id = auth.uid() or c.owner_id = auth.uid());

  if promo.id is null then
    raise exception 'Promotion not found.' using errcode = 'P0001';
  end if;

  update public.promotions set active = false, ended_at = now() where id = promo.id;
  update public.promotion_requests set status = 'cancelled', decided_at = now()
   where car_id = promo.car_id and promoter_id = promo.promoter_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: resolve_referral — public; used by the short link /r/CODE
-- -----------------------------------------------------------------------------
create or replace function public.resolve_referral(p_code text)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
           'public_id', c.public_id, 'year', c.year, 'make', c.make, 'model', c.model,
           'city', c.city, 'state', c.state
         )
    from public.promotions p
    join public.cars c on c.id = p.car_id
   where p.referral_code = p_code
     and p.active
     and c.status in ('active', 'pending_sale', 'sold');
$$;

-- -----------------------------------------------------------------------------
-- RPC: record_referral_click — public; called when a visitor lands with ?ref=
-- De-duplicates repeat visits (same visitor, same link, 30 min) and ignores
-- the promoter's and the owner's own clicks.
-- -----------------------------------------------------------------------------
create or replace function public.record_referral_click(
  p_code text,
  p_visitor_id text,
  p_referrer text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  promo public.promotions;
  car public.cars;
  promoter_name text;
begin
  if p_code is null or p_visitor_id is null or char_length(p_visitor_id) not between 8 and 64 then
    return null;
  end if;

  select * into promo from public.promotions where referral_code = p_code and active;
  if promo.id is null then
    return null;
  end if;

  select * into car from public.cars where id = promo.car_id;
  if car.status not in ('active', 'pending_sale') then
    return null;
  end if;

  select split_part(coalesce(full_name, 'A promoter'), ' ', 1) into promoter_name
    from public.profiles where id = promo.promoter_id;

  if auth.uid() is distinct from promo.promoter_id
     and auth.uid() is distinct from car.owner_id
     and not exists (
       select 1 from public.referral_clicks
        where promotion_id = promo.id
          and visitor_id = p_visitor_id
          and created_at > now() - interval '30 minutes'
     )
  then
    insert into public.referral_clicks (promotion_id, car_id, visitor_id, user_id, referrer)
    values (promo.id, promo.car_id, p_visitor_id, auth.uid(), left(p_referrer, 500));
  end if;

  return json_build_object('car_id', car.id, 'public_id', car.public_id, 'promoter_name', promoter_name);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: my_promotions — promoter dashboard (one row per promotion with stats)
-- -----------------------------------------------------------------------------
create or replace function public.my_promotions()
returns table (
  promotion_id uuid,
  referral_code text,
  active boolean,
  created_at timestamptz,
  car_id uuid,
  public_id bigint,
  year smallint,
  make text,
  model text,
  trim_level text,
  price integer,
  city text,
  state char(2),
  car_status public.car_status,
  commission_type public.commission_type,
  commission_value numeric,
  cover_url text,
  clicks bigint,
  unique_visitors bigint,
  clicks_7d bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.referral_code, p.active, p.created_at,
         c.id, c.public_id, c.year, c.make, c.model, c.trim_level, c.price, c.city, c.state, c.status,
         c.commission_type, c.commission_value,
         (select ph.url from public.car_photos ph where ph.car_id = c.id order by ph.position limit 1),
         count(rc.id),
         count(distinct rc.visitor_id),
         count(rc.id) filter (where rc.created_at > now() - interval '7 days')
    from public.promotions p
    join public.cars c on c.id = p.car_id
    left join public.referral_clicks rc on rc.promotion_id = p.id
   where p.promoter_id = auth.uid()
   group by p.id, c.id
   order by p.active desc, p.created_at desc;
$$;

-- -----------------------------------------------------------------------------
-- RPC: owner_promoters — owner sees who promotes each of their cars
-- -----------------------------------------------------------------------------
create or replace function public.owner_promoters()
returns table (
  promotion_id uuid,
  car_id uuid,
  promoter_id uuid,
  promoter_name text,
  promoter_avatar text,
  promoter_verified boolean,
  promoter_level public.promoter_level,
  active boolean,
  created_at timestamptz,
  clicks bigint,
  unique_visitors bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.car_id, p.promoter_id, pr.full_name, pr.avatar_url, pr.identity_verified, pr.promoter_level,
         p.active, p.created_at, count(rc.id), count(distinct rc.visitor_id)
    from public.promotions p
    join public.cars c on c.id = p.car_id
    join public.profiles pr on pr.id = p.promoter_id
    left join public.referral_clicks rc on rc.promotion_id = p.id
   where c.owner_id = auth.uid()
   group by p.id, pr.id
   order by p.active desc, count(rc.id) desc;
$$;

-- Public RPCs
grant execute on function public.resolve_referral(text) to anon, authenticated;
grant execute on function public.record_referral_click(text, text, text) to anon, authenticated;
-- Signed-in only
revoke execute on function public.request_promotion(uuid, text) from public, anon;
revoke execute on function public.decide_promotion_request(uuid, boolean) from public, anon;
revoke execute on function public.end_promotion(uuid) from public, anon;
revoke execute on function public.my_promotions() from public, anon;
revoke execute on function public.owner_promoters() from public, anon;
grant execute on function public.request_promotion(uuid, text) to authenticated;
grant execute on function public.decide_promotion_request(uuid, boolean) to authenticated;
grant execute on function public.end_promotion(uuid) to authenticated;
grant execute on function public.my_promotions() to authenticated;
grant execute on function public.owner_promoters() to authenticated;
