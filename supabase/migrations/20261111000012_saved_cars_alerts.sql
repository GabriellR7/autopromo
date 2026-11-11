-- =============================================================================
-- Etapa 2 — Bring buyers back:
--   * saved_cars      — favorites (heart button), up to 200 per person
--   * saved_searches  — "alert me when a car like this is listed" (e-mail digest,
--                       at most one e-mail per search per ~day), up to 10 per person
--   * price drops     — cars remember their previous price; people who saved the
--                       car get an e-mail when the price goes down
-- E-mails are sent by the `notifications` Edge Function (service role only).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Favorites
-- -----------------------------------------------------------------------------
create table public.saved_cars (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  car_id         uuid not null references public.cars (id) on delete cascade,
  price_at_save  numeric(10, 2),
  created_at     timestamptz not null default now(),
  primary key (user_id, car_id)
);
create index idx_saved_cars_car on public.saved_cars (car_id);

alter table public.saved_cars enable row level security;

create policy "Users see their saved cars"
  on public.saved_cars for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users save cars"
  on public.saved_cars for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users unsave cars"
  on public.saved_cars for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_cars from anon, authenticated;
grant select, delete on public.saved_cars to authenticated;
grant insert (user_id, car_id) on public.saved_cars to authenticated;

create or replace function public.saved_cars_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_cars where user_id = new.user_id) >= 200 then
    raise exception 'You can save up to 200 cars. Remove a few to save more.';
  end if;
  select price into new.price_at_save from public.cars where id = new.car_id;
  return new;
end;
$$;
revoke execute on function public.saved_cars_before_insert() from public, anon, authenticated;

create trigger trg_saved_cars_before_insert
  before insert on public.saved_cars
  for each row execute function public.saved_cars_before_insert();

-- -----------------------------------------------------------------------------
-- Saved searches
-- filters uses the same keys as the /cars URL: q, make, model, yearMin, yearMax,
-- priceMin, priceMax, mileageMax, transmission, fuel, body, zip, radius.
-- -----------------------------------------------------------------------------
create table public.saved_searches (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles (id) on delete cascade,
  name              text not null check (char_length(name) between 1 and 80),
  filters           jsonb not null default '{}'::jsonb,
  origin_lat        double precision,
  origin_lng        double precision,
  email_alerts      boolean not null default true,
  last_notified_at  timestamptz not null default now(),
  created_at        timestamptz not null default now()
);
create index idx_saved_searches_user on public.saved_searches (user_id);
create index idx_saved_searches_alerts on public.saved_searches (last_notified_at) where email_alerts;

alter table public.saved_searches enable row level security;

create policy "Users see their saved searches"
  on public.saved_searches for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Users create saved searches"
  on public.saved_searches for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "Users update their saved searches"
  on public.saved_searches for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "Users delete their saved searches"
  on public.saved_searches for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.saved_searches from anon, authenticated;
grant select, delete on public.saved_searches to authenticated;
grant insert (user_id, name, filters, origin_lat, origin_lng, email_alerts) on public.saved_searches to authenticated;
grant update (name, email_alerts) on public.saved_searches to authenticated;

create or replace function public.saved_searches_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select count(*) from public.saved_searches where user_id = new.user_id) >= 10 then
    raise exception 'You can keep up to 10 saved searches. Delete one to add another.';
  end if;
  return new;
end;
$$;
revoke execute on function public.saved_searches_limit() from public, anon, authenticated;

create trigger trg_saved_searches_limit
  before insert on public.saved_searches
  for each row execute function public.saved_searches_limit();

-- Same rules as the search page (src/lib/cars.ts → searchCars).
create or replace function public.car_matches_filters(
  c public.cars, f jsonb, o_lat double precision, o_lng double precision
)
returns boolean
language plpgsql
stable
set search_path = ''
as $$
declare
  term text;
  radius double precision := nullif(f ->> 'radius', '')::double precision;
begin
  if nullif(f ->> 'make', '') is not null and c.make not ilike (f ->> 'make') then return false; end if;
  if nullif(f ->> 'model', '') is not null and c.model not ilike '%' || (f ->> 'model') || '%' then return false; end if;
  if nullif(f ->> 'yearMin', '') is not null and c.year < (f ->> 'yearMin')::int then return false; end if;
  if nullif(f ->> 'yearMax', '') is not null and c.year > (f ->> 'yearMax')::int then return false; end if;
  if nullif(f ->> 'priceMin', '') is not null and c.price < (f ->> 'priceMin')::numeric then return false; end if;
  if nullif(f ->> 'priceMax', '') is not null and c.price > (f ->> 'priceMax')::numeric then return false; end if;
  if nullif(f ->> 'mileageMax', '') is not null and c.mileage > (f ->> 'mileageMax')::int then return false; end if;
  if nullif(f ->> 'transmission', '') is not null and c.transmission::text <> (f ->> 'transmission') then return false; end if;
  if nullif(f ->> 'fuel', '') is not null and c.fuel_type::text <> (f ->> 'fuel') then return false; end if;
  if nullif(f ->> 'body', '') is not null and c.body_type::text <> (f ->> 'body') then return false; end if;
  if nullif(f ->> 'q', '') is not null then
    foreach term in array (regexp_split_to_array(trim(f ->> 'q'), '\s+'))[1:4] loop
      if term ~ '^\d{4}$' then
        if c.year <> term::int then return false; end if;
      elsif term <> '' and not (c.make ilike '%' || term || '%' or c.model ilike '%' || term || '%'
                                or coalesce(c.trim_level, '') ilike '%' || term || '%') then
        return false;
      end if;
    end loop;
  end if;
  if radius is not null and o_lat is not null and o_lng is not null then
    if c.lat is null or c.lng is null then return false; end if;
    if 3958.8 * 2 * asin(sqrt(
         power(sin(radians(c.lat - o_lat) / 2), 2)
         + cos(radians(o_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - o_lng) / 2), 2)
       )) > radius then
      return false;
    end if;
  end if;
  return true;
exception when others then
  return false; -- malformed filters never break the alert job
end;
$$;

-- New matching listings for each saved search (service role, cron).
create or replace function public.pending_search_alerts()
returns table (
  search_id uuid,
  search_name text,
  recipient_email text,
  recipient_name text,
  cars jsonb,
  total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, u.email, p.full_name, m.cars, m.total
    from public.saved_searches s
    join public.profiles p on p.id = s.user_id and not p.suspended
    join auth.users u on u.id = s.user_id
    cross join lateral (
      select count(*) as total,
             jsonb_agg(x.card order by x.published_at desc) filter (where x.rn <= 6) as cars
        from (
          select c.published_at,
                 row_number() over (order by c.published_at desc) as rn,
                 jsonb_build_object(
                   'public_id', c.public_id, 'year', c.year, 'make', c.make, 'model', c.model,
                   'trim_level', c.trim_level, 'price', c.price, 'mileage', c.mileage, 'city', c.city, 'state', c.state,
                   'photo', (select ph.url from public.car_photos ph where ph.car_id = c.id order by ph.position limit 1)
                 ) as card
            from public.cars c
           where c.status = 'active'
             and c.published_at > s.last_notified_at
             and c.owner_id <> s.user_id
             and public.owner_has_access(c.owner_id)
             and public.car_matches_filters(c, s.filters, s.origin_lat, s.origin_lng)
        ) x
    ) m
   where s.email_alerts
     and s.last_notified_at < now() - interval '20 hours'
     and m.total > 0
   limit 300;
$$;

create or replace function public.mark_search_notified(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.saved_searches set last_notified_at = now() where id = any (p_ids);
$$;

-- -----------------------------------------------------------------------------
-- Price drops
-- -----------------------------------------------------------------------------
alter table public.cars
  add column previous_price numeric(10, 2),
  add column price_dropped_at timestamptz;
-- Readable by everyone (table-level select); not writable from the browser
-- (cars uses column-level insert/update grants).

create table public.price_drops (
  id           uuid primary key default gen_random_uuid(),
  car_id       uuid not null references public.cars (id) on delete cascade,
  old_price    numeric(10, 2) not null,
  new_price    numeric(10, 2) not null,
  created_at   timestamptz not null default now(),
  notified_at  timestamptz
);
create index idx_price_drops_pending on public.price_drops (created_at) where notified_at is null;
alter table public.price_drops enable row level security; -- no client access
revoke all on public.price_drops from anon, authenticated;

create or replace function public.cars_track_price_drop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.price is distinct from old.price then
    if new.price < old.price
       and old.status in ('active', 'pending_sale')
       and (old.price - new.price >= 100 or old.price - new.price >= old.price * 0.02) then
      new.previous_price := old.price;
      new.price_dropped_at := now();
      insert into public.price_drops (car_id, old_price, new_price) values (new.id, old.price, new.price);
    elsif new.price > coalesce(new.previous_price, 0) then
      -- price went back up: the "was" price is no longer meaningful
      new.previous_price := null;
      new.price_dropped_at := null;
    end if;
  end if;
  return new;
end;
$$;
revoke execute on function public.cars_track_price_drop() from public, anon, authenticated;

create trigger trg_cars_price_drop
  before update of price on public.cars
  for each row execute function public.cars_track_price_drop();

-- People who saved a car whose price dropped (service role, cron), one row per person.
create or replace function public.pending_price_drop_alerts()
returns table (
  recipient_email text,
  recipient_name text,
  cars jsonb,
  car_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  with pending as (
    select d.car_id, (array_agg(d.old_price order by d.created_at))[1] as from_price
      from public.price_drops d
     where d.notified_at is null
     group by d.car_id
  )
  select u.email, p.full_name,
         jsonb_agg(jsonb_build_object(
           'public_id', c.public_id, 'year', c.year, 'make', c.make, 'model', c.model, 'trim_level', c.trim_level,
           'city', c.city, 'state', c.state, 'old_price', pd.from_price, 'price', c.price,
           'photo', (select ph.url from public.car_photos ph where ph.car_id = c.id order by ph.position limit 1)
         ) order by c.price),
         array_agg(c.id)
    from pending pd
    join public.cars c on c.id = pd.car_id and c.status in ('active', 'pending_sale') and c.price < pd.from_price
    join public.saved_cars s on s.car_id = c.id and s.user_id <> c.owner_id and coalesce(s.price_at_save, pd.from_price) > c.price
    join public.profiles p on p.id = s.user_id and not p.suspended
    join auth.users u on u.id = s.user_id
   group by u.email, p.full_name
   limit 500;
$$;

-- Marks drops as handled; only those that existed when the job started.
create or replace function public.mark_price_drops_notified(p_car_ids uuid[], p_before timestamptz)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.price_drops set notified_at = now()
   where car_id = any (p_car_ids) and notified_at is null and created_at <= p_before;
$$;

-- Drops nobody saved still need to be closed out, so the queue doesn't grow forever.
create or replace function public.close_stale_price_drops()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.price_drops set notified_at = now()
   where notified_at is null and created_at < now() - interval '2 days';
$$;

-- Permissions for the cron helpers: service role only
revoke execute on function public.pending_search_alerts() from public, anon, authenticated;
revoke execute on function public.mark_search_notified(uuid[]) from public, anon, authenticated;
revoke execute on function public.pending_price_drop_alerts() from public, anon, authenticated;
revoke execute on function public.mark_price_drops_notified(uuid[], timestamptz) from public, anon, authenticated;
revoke execute on function public.close_stale_price_drops() from public, anon, authenticated;
grant execute on function public.pending_search_alerts() to service_role;
grant execute on function public.mark_search_notified(uuid[]) to service_role;
grant execute on function public.pending_price_drop_alerts() to service_role;
grant execute on function public.mark_price_drops_notified(uuid[], timestamptz) to service_role;
grant execute on function public.close_stale_price_drops() to service_role;
revoke execute on function public.car_matches_filters(public.cars, jsonb, double precision, double precision) from public, anon, authenticated;
