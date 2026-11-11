-- =============================================================================
-- AutoPromo — Phase 4: sales, commissions, Stripe payouts, disputes
-- Money is stored in cents (integer).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Promoter payout accounts (Stripe Connect Express). Written only by Edge
-- Functions with the service role; the promoter can read their own row.
-- -----------------------------------------------------------------------------
create table public.payout_accounts (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  stripe_account_id  text unique,
  details_submitted  boolean not null default false,
  payouts_enabled    boolean not null default false,
  updated_at         timestamptz not null default now()
);

create trigger trg_payout_accounts_updated_at
  before update on public.payout_accounts
  for each row execute function public.set_updated_at();

alter table public.payout_accounts enable row level security;

create policy "Users read their own payout account"
  on public.payout_accounts for select
  using (user_id = auth.uid() or public.is_admin());

revoke all on public.payout_accounts from anon;
revoke insert, update, delete on public.payout_accounts from authenticated;
grant select on public.payout_accounts to authenticated;

-- -----------------------------------------------------------------------------
-- sales
-- -----------------------------------------------------------------------------
create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  car_id           uuid not null unique references public.cars (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  conversation_id  uuid references public.conversations (id) on delete set null,
  promotion_id     uuid references public.promotions (id) on delete set null,
  sale_price       integer not null check (sale_price > 0),
  created_at       timestamptz not null default now()
);

alter table public.sales enable row level security;

create policy "Owner, credited promoter and admins see sales"
  on public.sales for select
  using (
    owner_id = auth.uid()
    or exists (select 1 from public.promotions p where p.id = promotion_id and p.promoter_id = auth.uid())
    or exists (select 1 from public.promotions p where p.car_id = sales.car_id and p.promoter_id = auth.uid())
    or public.is_admin()
  );

-- -----------------------------------------------------------------------------
-- commissions
-- -----------------------------------------------------------------------------
create type public.commission_status as enum ('pending', 'paid', 'cancelled');

create table public.commissions (
  id                          uuid primary key default gen_random_uuid(),
  sale_id                     uuid not null references public.sales (id) on delete cascade,
  car_id                      uuid not null references public.cars (id) on delete cascade,
  owner_id                    uuid not null references public.profiles (id) on delete cascade,
  promoter_id                 uuid not null references public.profiles (id) on delete cascade,
  promotion_id                uuid references public.promotions (id) on delete set null,
  amount_cents                integer not null check (amount_cents > 0),
  platform_fee_cents          integer not null check (platform_fee_cents >= 0),
  promoter_amount_cents       integer generated always as (amount_cents - platform_fee_cents) stored,
  status                      public.commission_status not null default 'pending',
  source                      text not null default 'owner' check (source in ('owner', 'dispute')),
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text,
  paid_at                     timestamptz,
  created_at                  timestamptz not null default now(),
  unique (sale_id, promoter_id),
  check (platform_fee_cents <= amount_cents)
);

create index idx_commissions_owner on public.commissions (owner_id, status);
create index idx_commissions_promoter on public.commissions (promoter_id, status);

alter table public.commissions enable row level security;

create policy "Owner, promoter and admins see commissions"
  on public.commissions for select
  using (auth.uid() in (owner_id, promoter_id) or public.is_admin());

-- -----------------------------------------------------------------------------
-- disputes
-- -----------------------------------------------------------------------------
create type public.dispute_status as enum ('open', 'resolved_promoter', 'resolved_owner', 'closed');

create table public.disputes (
  id               uuid primary key default gen_random_uuid(),
  sale_id          uuid not null references public.sales (id) on delete cascade,
  car_id           uuid not null references public.cars (id) on delete cascade,
  owner_id         uuid not null references public.profiles (id) on delete cascade,
  promoter_id      uuid not null references public.profiles (id) on delete cascade,
  promotion_id     uuid references public.promotions (id) on delete set null,
  opened_by        text not null check (opened_by in ('system', 'promoter')),
  reason           text not null check (char_length(reason) <= 1000),
  evidence         jsonb not null default '{}'::jsonb,
  status           public.dispute_status not null default 'open',
  resolution_note  text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  unique (sale_id, promoter_id)
);

alter table public.disputes enable row level security;

create policy "Owner, promoter and admins see disputes"
  on public.disputes for select
  using (auth.uid() in (owner_id, promoter_id) or public.is_admin());

revoke all on public.sales, public.commissions, public.disputes from anon;
revoke insert, update, delete on public.sales, public.commissions, public.disputes from authenticated;
grant select on public.sales, public.commissions, public.disputes to authenticated;

-- -----------------------------------------------------------------------------
-- A car can only be marked "sold" through confirm_sale() (or by an admin),
-- so a sale never skips commission/dispute checks.
-- -----------------------------------------------------------------------------
create or replace function public.cars_guard_sold()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'sold' and old.status is distinct from 'sold'
     and coalesce(current_setting('app.confirming_sale', true), '') <> 'on'
     and not public.is_admin()
     and auth.uid() is not null then
    raise exception 'Use "Mark as sold" to record the sale.' using errcode = 'P0001';
  end if;
  if old.status = 'sold' and new.status <> 'sold' and not public.is_admin() and auth.uid() is not null then
    raise exception 'A sold listing cannot be reopened. Contact support if this was a mistake.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_cars_guard_sold
  before update of status on public.cars
  for each row execute function public.cars_guard_sold();

-- -----------------------------------------------------------------------------
-- RPC: sale_attribution_options — what the owner sees in the "Mark as sold" dialog
-- -----------------------------------------------------------------------------
create or replace function public.sale_attribution_options(p_car_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  car public.cars;
begin
  select * into car from public.cars where id = p_car_id and owner_id = auth.uid();
  if car.id is null then
    raise exception 'Listing not found.' using errcode = 'P0001';
  end if;

  return json_build_object(
    'buyers', coalesce((
      select json_agg(json_build_object(
               'conversation_id', c.id,
               'buyer_id', b.id,
               'buyer_name', b.full_name,
               'promotion_id', c.promotion_id,
               'promoter_name', pp.full_name,
               'has_visit', exists (select 1 from public.visits v where v.conversation_id = c.id and v.status in ('confirmed', 'completed')),
               'last_message_at', c.last_message_at
             ) order by c.last_message_at desc nulls last)
        from public.conversations c
        join public.profiles b on b.id = case when c.initiator_id = car.owner_id then c.recipient_id else c.initiator_id end
        left join public.promotions pr on pr.id = c.promotion_id
        left join public.profiles pp on pp.id = pr.promoter_id
       where c.car_id = car.id
         and car.owner_id in (c.initiator_id, c.recipient_id)
         and not exists (select 1 from public.promotions x where x.car_id = car.id and x.promoter_id = b.id)
    ), '[]'::json),
    'promoters', coalesce((
      select json_agg(json_build_object(
               'promotion_id', p.id,
               'promoter_id', p.promoter_id,
               'promoter_name', pr.full_name,
               'active', p.active,
               'clicks', (select count(*) from public.referral_clicks rc where rc.promotion_id = p.id),
               'conversations', (select count(*) from public.conversations c where c.promotion_id = p.id)
             ) order by p.active desc, p.created_at)
        from public.promotions p
        join public.profiles pr on pr.id = p.promoter_id
       where p.car_id = car.id
    ), '[]'::json),
    'commission_type', car.commission_type,
    'commission_value', car.commission_value,
    'platform_fee_percent', (select platform_fee_percent from public.platform_settings where id = 1)
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Internal: creates the commission for a promoter on a sale
-- -----------------------------------------------------------------------------
create or replace function public.create_commission(p_sale_id uuid, p_promotion_id uuid, p_source text default 'owner')
returns public.commissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales;
  car public.cars;
  promo public.promotions;
  fee_pct numeric;
  amount integer;
  result public.commissions;
begin
  select * into s from public.sales where id = p_sale_id;
  select * into car from public.cars where id = s.car_id;
  select * into promo from public.promotions where id = p_promotion_id and car_id = s.car_id;
  if promo.id is null then
    raise exception 'That promoter is not linked to this car.' using errcode = 'P0001';
  end if;

  select platform_fee_percent into fee_pct from public.platform_settings where id = 1;
  amount := case
    when car.commission_type = 'percent' then round(s.sale_price * car.commission_value)::int  -- price($) * pct → cents
    else round(car.commission_value * 100)::int
  end;
  if amount <= 0 then
    raise exception 'This listing has no referral fee.' using errcode = 'P0001';
  end if;

  insert into public.commissions (sale_id, car_id, owner_id, promoter_id, promotion_id, amount_cents, platform_fee_cents, source)
  values (s.id, s.car_id, s.owner_id, promo.promoter_id, promo.id, amount, round(amount * fee_pct / 100)::int, p_source)
  on conflict (sale_id, promoter_id) do nothing
  returning * into result;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: confirm_sale — owner records the sale. Creates the commission for the
-- chosen promoter and opens disputes automatically for other promoters that
-- have evidence of referring a buyer (attributed conversations).
-- -----------------------------------------------------------------------------
create or replace function public.confirm_sale(
  p_car_id uuid,
  p_sale_price integer,
  p_promotion_id uuid default null,
  p_conversation_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  car public.cars;
  v_sale_id uuid;
  comm public.commissions;
  promo_id uuid := p_promotion_id;
  r record;
  disputes_opened int := 0;
begin
  select * into car from public.cars where id = p_car_id and owner_id = auth.uid() for update;
  if car.id is null then
    raise exception 'Listing not found.' using errcode = 'P0001';
  end if;
  if car.status not in ('active', 'pending_sale', 'paused') then
    raise exception 'Only live listings can be marked as sold.' using errcode = 'P0001';
  end if;
  if p_sale_price is null or p_sale_price <= 0 then
    raise exception 'Enter the final sale price.' using errcode = 'P0001';
  end if;
  if p_conversation_id is not null
     and not exists (select 1 from public.conversations where id = p_conversation_id and car_id = car.id) then
    raise exception 'Invalid buyer.' using errcode = 'P0001';
  end if;
  -- If the chosen buyer came through a promoter, that promoter must be credited.
  if promo_id is null and p_conversation_id is not null then
    select promotion_id into promo_id from public.conversations where id = p_conversation_id;
  end if;
  if promo_id is not null and not exists (select 1 from public.promotions where id = promo_id and car_id = car.id) then
    raise exception 'That promoter is not linked to this car.' using errcode = 'P0001';
  end if;

  perform set_config('app.confirming_sale', 'on', true);
  update public.cars set status = 'sold', sold_price = p_sale_price where id = car.id;
  perform set_config('app.confirming_sale', 'off', true);

  insert into public.sales (car_id, owner_id, conversation_id, promotion_id, sale_price)
  values (car.id, car.owner_id, p_conversation_id, promo_id, p_sale_price)
  returning id into v_sale_id;

  if promo_id is not null then
    comm := public.create_commission(v_sale_id, promo_id, 'owner');
  end if;

  -- Promoters with referred conversations who were not credited → dispute
  for r in
    select p.id as promotion_id, p.promoter_id, count(c.id) as convs,
           count(v.id) filter (where v.status in ('confirmed', 'completed')) as visits
      from public.promotions p
      join public.conversations c on c.promotion_id = p.id
      left join public.visits v on v.conversation_id = c.id
     where p.car_id = car.id
       and p.id is distinct from promo_id
     group by p.id
  loop
    insert into public.disputes (sale_id, car_id, owner_id, promoter_id, promotion_id, opened_by, reason, evidence)
    values (v_sale_id, car.id, car.owner_id, r.promoter_id, r.promotion_id, 'system',
            'The car was marked as sold without crediting a promoter who referred buyers.',
            json_build_object('referred_conversations', r.convs, 'confirmed_visits', r.visits)::jsonb)
    on conflict (sale_id, promoter_id) do nothing;
    disputes_opened := disputes_opened + 1;
  end loop;

  -- End all promotions for this car
  update public.promotions set active = false, ended_at = coalesce(ended_at, now()) where car_id = car.id and active;

  return json_build_object('sale_id', v_sale_id, 'commission_id', comm.id, 'disputes_opened', disputes_opened);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: open_dispute — a promoter says they referred the buyer (within 30 days)
-- -----------------------------------------------------------------------------
create or replace function public.open_dispute(p_sale_id uuid, p_reason text)
returns public.disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales;
  promo public.promotions;
  d public.disputes;
begin
  select * into s from public.sales where id = p_sale_id;
  select * into promo from public.promotions where car_id = s.car_id and promoter_id = auth.uid();
  if s.id is null or promo.id is null then
    raise exception 'Sale not found.' using errcode = 'P0001';
  end if;
  if s.created_at < now() - interval '30 days' then
    raise exception 'Disputes must be opened within 30 days of the sale.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.commissions where sale_id = s.id and promoter_id = auth.uid()) then
    raise exception 'You already have a commission for this sale.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 20 then
    raise exception 'Explain what happened (at least 20 characters).' using errcode = 'P0001';
  end if;

  insert into public.disputes (sale_id, car_id, owner_id, promoter_id, promotion_id, opened_by, reason, evidence)
  values (s.id, s.car_id, s.owner_id, auth.uid(), promo.id, 'promoter', trim(p_reason),
          json_build_object(
            'clicks', (select count(*) from public.referral_clicks where promotion_id = promo.id),
            'referred_conversations', (select count(*) from public.conversations where promotion_id = promo.id)
          )::jsonb)
  on conflict (sale_id, promoter_id) do update set reason = excluded.reason, status = 'open'
  returning * into d;
  return d;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: my_earnings — promoter view (commissions + sold cars they promoted)
-- -----------------------------------------------------------------------------
create or replace function public.my_earnings()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'commissions', coalesce((
      select json_agg(json_build_object(
               'id', cm.id, 'status', cm.status, 'amount_cents', cm.amount_cents,
               'platform_fee_cents', cm.platform_fee_cents, 'promoter_amount_cents', cm.promoter_amount_cents,
               'source', cm.source, 'paid_at', cm.paid_at, 'created_at', cm.created_at,
               'car_title', c.year || ' ' || c.make || ' ' || c.model, 'car_public_id', c.public_id,
               'car_city', c.city, 'car_state', c.state, 'owner_name', o.full_name
             ) order by cm.created_at desc)
        from public.commissions cm
        join public.cars c on c.id = cm.car_id
        join public.profiles o on o.id = cm.owner_id
       where cm.promoter_id = auth.uid()
    ), '[]'::json),
    'uncredited_sales', coalesce((
      select json_agg(json_build_object(
               'sale_id', s.id, 'sold_at', s.created_at,
               'car_title', c.year || ' ' || c.make || ' ' || c.model,
               'dispute_status', d.status, 'dispute_opened_by', d.opened_by
             ) order by s.created_at desc)
        from public.sales s
        join public.cars c on c.id = s.car_id
        join public.promotions p on p.car_id = s.car_id and p.promoter_id = auth.uid()
        left join public.disputes d on d.sale_id = s.id and d.promoter_id = auth.uid()
       where not exists (select 1 from public.commissions cm where cm.sale_id = s.id and cm.promoter_id = auth.uid())
         and s.created_at > now() - interval '90 days'
    ), '[]'::json)
  );
$$;

-- -----------------------------------------------------------------------------
-- RPC: owner_commissions — what the owner owes / has paid, plus disputes
-- -----------------------------------------------------------------------------
create or replace function public.owner_commissions()
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'commissions', coalesce((
      select json_agg(json_build_object(
               'id', cm.id, 'status', cm.status, 'amount_cents', cm.amount_cents, 'paid_at', cm.paid_at,
               'created_at', cm.created_at, 'source', cm.source,
               'car_title', c.year || ' ' || c.make || ' ' || c.model, 'car_public_id', c.public_id,
               'promoter_name', p.full_name,
               'promoter_ready', coalesce(pa.payouts_enabled, false)
             ) order by (cm.status = 'pending') desc, cm.created_at desc)
        from public.commissions cm
        join public.cars c on c.id = cm.car_id
        join public.profiles p on p.id = cm.promoter_id
        left join public.payout_accounts pa on pa.user_id = cm.promoter_id
       where cm.owner_id = auth.uid()
    ), '[]'::json),
    'disputes', coalesce((
      select json_agg(json_build_object(
               'id', d.id, 'status', d.status, 'opened_by', d.opened_by, 'reason', d.reason,
               'evidence', d.evidence, 'created_at', d.created_at, 'resolution_note', d.resolution_note,
               'car_title', c.year || ' ' || c.make || ' ' || c.model, 'promoter_name', p.full_name
             ) order by d.created_at desc)
        from public.disputes d
        join public.cars c on c.id = d.car_id
        join public.profiles p on p.id = d.promoter_id
       where d.owner_id = auth.uid()
    ), '[]'::json)
  );
$$;

-- -----------------------------------------------------------------------------
-- Promoter level grows with paid commissions (bronze → silver at 3, gold at 10)
-- -----------------------------------------------------------------------------
create or replace function public.update_promoter_level()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select count(*) into n from public.commissions where promoter_id = new.promoter_id and status = 'paid';
    update public.profiles
       set promoter_level = case when n >= 10 then 'gold'::public.promoter_level
                                 when n >= 3 then 'silver'::public.promoter_level
                                 else promoter_level end
     where id = new.promoter_id;
  end if;
  return new;
end;
$$;

create trigger trg_commissions_level
  after update of status on public.commissions
  for each row execute function public.update_promoter_level();

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.cars_guard_sold() from public, anon, authenticated;
revoke execute on function public.create_commission(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.update_promoter_level() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.sale_attribution_options(uuid)',
    'public.confirm_sale(uuid, integer, uuid, uuid)',
    'public.open_dispute(uuid, text)',
    'public.my_earnings()',
    'public.owner_commissions()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
