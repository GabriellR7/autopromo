-- =============================================================================
-- Etapa 3 — Help owners sell faster:
--   * price_insight()     — price range of similar cars on AutoPromo
--   * car_view_days       — views per car per day (filled by increment_car_views)
--   * owner_car_stats()   — daily views, promoter clicks, chats and saves for
--                           the owner's own car (+ how many people saved it)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Suggested price: similar make/model, year ±2, mileage ±40% (listings and sales
-- from the last 12 months). Falls back to make + year ±3 when there are fewer
-- than 3 matches. Needs at least 3 cars to return a range.
-- -----------------------------------------------------------------------------
create or replace function public.price_insight(
  p_make text, p_model text, p_year int, p_mileage int, p_exclude uuid default null
)
returns table (comparable_count int, low numeric, median numeric, high numeric, scope text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  n int;
begin
  if coalesce(trim(p_make), '') = '' or p_year is null then
    return;
  end if;

  return query
    with comps as (
      select coalesce(c.sold_price, c.price) as p
        from public.cars c
       where c.status in ('active', 'pending_sale', 'sold')
         and coalesce(c.sold_at, c.published_at, c.created_at) > now() - interval '12 months'
         and c.id is distinct from p_exclude
         and c.make ilike p_make
         and c.model ilike coalesce(nullif(trim(p_model), ''), c.model)
         and c.year between p_year - 2 and p_year + 2
         and (p_mileage is null or c.mileage between p_mileage * 0.6 and p_mileage * 1.4 + 5000)
    )
    select count(*)::int,
           round(percentile_cont(0.25) within group (order by p)::numeric, -2),
           round(percentile_cont(0.5) within group (order by p)::numeric, -2),
           round(percentile_cont(0.75) within group (order by p)::numeric, -2),
           'model'::text
      from comps
    having count(*) >= 3;
  get diagnostics n = row_count;
  if n > 0 then
    return;
  end if;

  return query
    with comps as (
      select coalesce(c.sold_price, c.price) as p
        from public.cars c
       where c.status in ('active', 'pending_sale', 'sold')
         and coalesce(c.sold_at, c.published_at, c.created_at) > now() - interval '12 months'
         and c.id is distinct from p_exclude
         and c.make ilike p_make
         and c.year between p_year - 3 and p_year + 3
    )
    select count(*)::int,
           round(percentile_cont(0.25) within group (order by p)::numeric, -2),
           round(percentile_cont(0.5) within group (order by p)::numeric, -2),
           round(percentile_cont(0.75) within group (order by p)::numeric, -2),
           'make'::text
      from comps
    having count(*) >= 3;
end;
$$;

revoke execute on function public.price_insight(text, text, int, int, uuid) from public, anon;
grant execute on function public.price_insight(text, text, int, int, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Daily views
-- -----------------------------------------------------------------------------
create table public.car_view_days (
  car_id  uuid not null references public.cars (id) on delete cascade,
  day     date not null,
  views   int not null default 0,
  primary key (car_id, day)
);
alter table public.car_view_days enable row level security; -- read through owner_car_stats only
revoke all on public.car_view_days from anon, authenticated;

create or replace function public.increment_car_views(p_car_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cars set views = views + 1 where id = p_car_id and status in ('active', 'pending_sale');
  if found then
    insert into public.car_view_days (car_id, day, views)
    values (p_car_id, (now() at time zone 'America/Chicago')::date, 1)
    on conflict (car_id, day) do update set views = public.car_view_days.views + 1;
  end if;
end;
$$;

revoke all on function public.increment_car_views(uuid) from public;
grant execute on function public.increment_car_views(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Owner stats for one car: one row per day (Central Time), last p_days days.
-- -----------------------------------------------------------------------------
create or replace function public.owner_car_stats(p_car_id uuid, p_days int default 30)
returns table (day date, views int, clicks int, chats int, saves int)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  days int := least(greatest(coalesce(p_days, 30), 7), 90);
  start_day date := (now() at time zone 'America/Chicago')::date - (days - 1);
begin
  if not exists (
    select 1 from public.cars c where c.id = p_car_id and (c.owner_id = (select auth.uid()) or (select public.is_admin()))
  ) then
    raise exception 'Listing not found.';
  end if;

  return query
    select d::date,
           coalesce((select v.views from public.car_view_days v where v.car_id = p_car_id and v.day = d::date), 0),
           (select count(*)::int from public.referral_clicks r
             where r.car_id = p_car_id and (r.created_at at time zone 'America/Chicago')::date = d::date),
           (select count(*)::int from public.conversations cv
             where cv.car_id = p_car_id and (cv.created_at at time zone 'America/Chicago')::date = d::date),
           (select count(*)::int from public.saved_cars s
             where s.car_id = p_car_id and (s.created_at at time zone 'America/Chicago')::date = d::date)
      from generate_series(start_day, start_day + (days - 1), interval '1 day') as d
     order by 1;
end;
$$;

revoke execute on function public.owner_car_stats(uuid, int) from public, anon;
grant execute on function public.owner_car_stats(uuid, int) to authenticated;

-- How many people saved each of the owner's cars (for My listings).
create or replace function public.my_car_save_counts()
returns table (car_id uuid, saves int)
language sql
stable
security definer
set search_path = ''
as $$
  select s.car_id, count(*)::int
    from public.saved_cars s
    join public.cars c on c.id = s.car_id
   where c.owner_id = (select auth.uid())
   group by s.car_id;
$$;

revoke execute on function public.my_car_save_counts() from public, anon;
grant execute on function public.my_car_save_counts() to authenticated;

create index if not exists idx_referral_clicks_car_time on public.referral_clicks (car_id, created_at);
create index if not exists idx_conversations_car_time on public.conversations (car_id, created_at);
create index if not exists idx_saved_cars_car_time on public.saved_cars (car_id, created_at);
