-- =============================================================================
-- AutoPromo — Phase 1: profiles, cars, photos, platform settings
-- Run in Supabase SQL Editor, or `supabase db push` with the CLI.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.car_status as enum ('draft', 'active', 'pending_sale', 'sold', 'paused');
create type public.transmission_type as enum ('automatic', 'manual', 'cvt');
create type public.fuel_type as enum ('gasoline', 'diesel', 'hybrid', 'plug_in_hybrid', 'electric', 'flex');
create type public.body_type as enum ('sedan', 'suv', 'truck', 'coupe', 'hatchback', 'van', 'wagon', 'convertible');
create type public.commission_type as enum ('fixed', 'percent');
create type public.active_mode as enum ('owner', 'promoter', 'buyer');
create type public.promoter_level as enum ('bronze', 'silver', 'gold');

-- -----------------------------------------------------------------------------
-- Shared helpers
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- -----------------------------------------------------------------------------
-- profiles (1:1 with auth.users). Holds NO sensitive data, so it is publicly
-- readable. Private data (phone, ID documents, payout info) will live in
-- separate owner-only tables in later phases.
-- -----------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  full_name          text check (char_length(full_name) <= 120),
  avatar_url         text,
  city               text,
  state              char(2),
  is_owner           boolean not null default false,
  is_promoter        boolean not null default false,
  is_admin           boolean not null default false,
  active_mode        public.active_mode not null default 'buyer',
  onboarded          boolean not null default false,
  identity_verified  boolean not null default false,
  promoter_level     public.promoter_level not null default 'bronze',
  accepted_terms_at  timestamptz,
  suspended          boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- is_admin() is SECURITY DEFINER so policies can call it without recursion.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin from public.profiles p where p.id = auth.uid()), false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated;

-- Create the profile automatically on sign-up (email or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url, accepted_terms_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    case when (new.raw_user_meta_data ->> 'accepted_terms') = 'true' then now() else null end
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
  on public.profiles for select
  using (true);

create policy "Users update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Admins update any profile"
  on public.profiles for update
  using (public.is_admin())
  with check (public.is_admin());

-- Column-level protection: regular users can only change "safe" columns.
-- is_admin, identity_verified, promoter_level and suspended can only be
-- changed by admins (via the admin panel in phase 5, using an RPC) or by
-- the service role.
revoke update on public.profiles from anon, authenticated;
grant update (full_name, avatar_url, city, state, is_owner, is_promoter, active_mode, onboarded, accepted_terms_at)
  on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- platform_settings (single row)
-- -----------------------------------------------------------------------------
create table public.platform_settings (
  id                        smallint primary key default 1 check (id = 1),
  platform_fee_percent      numeric(5,2) not null default 10 check (platform_fee_percent between 0 and 100),
  default_commission_type   public.commission_type not null default 'fixed',
  default_commission_value  numeric(10,2) not null default 300 check (default_commission_value >= 0),
  enabled_states            text[] not null default array['TX'],
  max_listings_per_user     integer not null default 5 check (max_listings_per_user > 0),
  updated_at                timestamptz not null default now()
);

insert into public.platform_settings (id) values (1) on conflict (id) do nothing;

create trigger trg_platform_settings_updated_at
  before update on public.platform_settings
  for each row execute function public.set_updated_at();

alter table public.platform_settings enable row level security;

create policy "Settings are publicly readable"
  on public.platform_settings for select
  using (true);

create policy "Only admins change settings"
  on public.platform_settings for update
  using (public.is_admin())
  with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- cars
-- -----------------------------------------------------------------------------
create table public.cars (
  id                           uuid primary key default gen_random_uuid(),
  public_id                    bigint generated always as identity unique,
  owner_id                     uuid not null references public.profiles (id) on delete cascade,
  status                       public.car_status not null default 'draft',

  make                         text not null check (char_length(make) between 1 and 40),
  model                        text not null check (char_length(model) between 1 and 60),
  year                         smallint not null check (year between 1950 and 2100),
  trim_level                   text check (char_length(trim_level) <= 60),
  mileage                      integer not null default 0 check (mileage >= 0),
  vin_last6                    text,  -- filled by trigger from car_private.vin
  exterior_color               text check (char_length(exterior_color) <= 40),
  transmission                 public.transmission_type not null default 'automatic',
  fuel_type                    public.fuel_type not null default 'gasoline',
  body_type                    public.body_type not null default 'sedan',

  price                        integer check (price > 0 and price < 10000000),  -- null only while draft
  description                  text check (char_length(description) <= 5000),

  zip                          char(5) check (zip ~ '^\d{5}$'),
  city                         text,
  state                        char(2),
  lat                          double precision check (lat between -90 and 90),
  lng                          double precision check (lng between -180 and 180),

  commission_type              public.commission_type not null default 'fixed',
  commission_value             numeric(10,2) not null default 300 check (commission_value >= 0),
  allow_any_verified_promoter  boolean not null default false,

  views                        integer not null default 0,
  published_at                 timestamptz,
  sold_at                      timestamptz,
  sold_price                   integer check (sold_price > 0),
  created_at                   timestamptz not null default now(),
  updated_at                   timestamptz not null default now(),

  constraint commission_percent_range check (commission_type <> 'percent' or commission_value <= 20),
  constraint active_requires_location check (status = 'draft' or (zip is not null and lat is not null and lng is not null)),
  constraint active_requires_price check (status = 'draft' or price is not null)
);

create index idx_cars_status_published on public.cars (status, published_at desc);
create index idx_cars_owner on public.cars (owner_id);
create index idx_cars_make_model on public.cars (lower(make), lower(model));
create index idx_cars_price on public.cars (price);
create index idx_cars_year on public.cars (year);
create index idx_cars_mileage on public.cars (mileage);
create index idx_cars_state on public.cars (state);
create index idx_cars_lat_lng on public.cars (lat, lng);

create trigger trg_cars_updated_at
  before update on public.cars
  for each row execute function public.set_updated_at();

-- Business rules enforced in the database (can't be bypassed from the browser):
--  * listings can only go live in enabled states
--  * max listings per user
--  * published_at / sold_at timestamps
create or replace function public.cars_enforce_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.platform_settings;
  listing_count integer;
begin
  select * into s from public.platform_settings where id = 1;

  if tg_op = 'INSERT' then
    select count(*) into listing_count
      from public.cars
     where owner_id = new.owner_id
       and status in ('draft', 'active', 'pending_sale', 'paused');
    if listing_count >= s.max_listings_per_user and not public.is_admin() then
      raise exception 'You can have at most % listings at a time.', s.max_listings_per_user
        using errcode = 'P0001';
    end if;
  end if;

  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if new.price is null then
      raise exception 'Set an asking price before publishing.' using errcode = 'P0001';
    end if;
    if new.state is null or new.zip is null or new.lat is null then
      raise exception 'Add the car location (ZIP code) before publishing.' using errcode = 'P0001';
    end if;
    if not (new.state = any (s.enabled_states)) then
      raise exception 'AutoPromo is not available in % yet.', new.state using errcode = 'P0001';
    end if;
    if new.published_at is null then
      new.published_at := now();
    end if;
  end if;

  if new.status = 'sold' and (tg_op = 'INSERT' or old.status is distinct from 'sold') then
    new.sold_at := now();
  elsif new.status <> 'sold' then
    new.sold_at := null;
  end if;

  return new;
end;
$$;

create trigger trg_cars_enforce_rules
  before insert or update on public.cars
  for each row execute function public.cars_enforce_rules();

alter table public.cars enable row level security;

create policy "Public sees live listings; owners see their own; admins see all"
  on public.cars for select
  using (
    status in ('active', 'pending_sale', 'sold')
    or owner_id = auth.uid()
    or public.is_admin()
  );

create policy "Owners create their own listings"
  on public.cars for insert
  with check (
    owner_id = auth.uid()
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended)
  );

create policy "Owners update their own listings"
  on public.cars for update
  using (owner_id = auth.uid() or public.is_admin())
  with check (owner_id = auth.uid() or public.is_admin());

create policy "Owners delete their own listings"
  on public.cars for delete
  using (owner_id = auth.uid() or public.is_admin());

-- Column-level: views / vin_last6 / timestamps can't be set from the browser.
revoke insert, update on public.cars from anon, authenticated;
grant insert (owner_id, status, make, model, year, trim_level, mileage, exterior_color, transmission, fuel_type,
              body_type, price, description, zip, city, state, lat, lng, commission_type,
              commission_value, allow_any_verified_promoter)
  on public.cars to authenticated;
grant update (status, make, model, year, trim_level, mileage, exterior_color, transmission, fuel_type,
              body_type, price, description, zip, city, state, lat, lng, commission_type,
              commission_value, allow_any_verified_promoter, sold_price)
  on public.cars to authenticated;

-- -----------------------------------------------------------------------------
-- car_private — the full VIN is visible only to the owner (and admins).
-- The public page shows "•••••••••••123456" using cars.vin_last6.
-- -----------------------------------------------------------------------------
create table public.car_private (
  car_id      uuid primary key references public.cars (id) on delete cascade,
  vin         text check (vin is null or vin ~ '^[A-HJ-NPR-Z0-9]{17}$'),
  updated_at  timestamptz not null default now()
);

create trigger trg_car_private_updated_at
  before update on public.car_private
  for each row execute function public.set_updated_at();

create or replace function public.sync_vin_last6()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.cars
     set vin_last6 = case when new.vin is null then null else right(new.vin, 6) end
   where id = new.car_id;
  return new;
end;
$$;

create trigger trg_car_private_sync
  after insert or update of vin on public.car_private
  for each row execute function public.sync_vin_last6();

alter table public.car_private enable row level security;

create policy "Owner manages private car data"
  on public.car_private for all
  using (exists (select 1 from public.cars c where c.id = car_id and (c.owner_id = auth.uid() or public.is_admin())))
  with check (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- car_photos
-- -----------------------------------------------------------------------------
create table public.car_photos (
  id            uuid primary key default gen_random_uuid(),
  car_id        uuid not null references public.cars (id) on delete cascade,
  storage_path  text,          -- null for external/seed images
  url           text not null,
  position      smallint not null default 0,
  created_at    timestamptz not null default now()
);

create index idx_car_photos_car on public.car_photos (car_id, position);

alter table public.car_photos enable row level security;

-- RLS on cars applies inside the subquery, so photos follow car visibility.
create policy "Photos visible with their car"
  on public.car_photos for select
  using (exists (select 1 from public.cars c where c.id = car_id));

create policy "Owner inserts photos"
  on public.car_photos for insert
  with check (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid()));

create policy "Owner updates photos"
  on public.car_photos for update
  using (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid()))
  with check (exists (select 1 from public.cars c where c.id = car_id and c.owner_id = auth.uid()));

create policy "Owner or admin deletes photos"
  on public.car_photos for delete
  using (exists (select 1 from public.cars c where c.id = car_id and (c.owner_id = auth.uid() or public.is_admin())));

-- Max 20 photos per car.
create or replace function public.car_photos_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.car_photos where car_id = new.car_id) >= 20 then
    raise exception 'A listing can have at most 20 photos.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_car_photos_limit
  before insert on public.car_photos
  for each row execute function public.car_photos_limit();

-- -----------------------------------------------------------------------------
-- RPC: search_cars — geo filter + distance sort. Returns rows of `cars`, so
-- the client can keep chaining filters, embeds (car_photos), range & count.
-- SECURITY INVOKER (default): RLS on cars still applies.
-- -----------------------------------------------------------------------------
create or replace function public.search_cars(
  origin_lat double precision default null,
  origin_lng double precision default null,
  radius_miles double precision default null,
  sort_by_distance boolean default false
)
returns setof public.cars
language sql
stable
set search_path = ''
as $$
  select c.*
    from public.cars c
   where c.status = 'active'
     and (
       origin_lat is null or origin_lng is null or radius_miles is null
       or (
         c.lat is not null and c.lng is not null
         -- cheap bounding box first (uses idx_cars_lat_lng)
         and c.lat between origin_lat - radius_miles / 69.0 and origin_lat + radius_miles / 69.0
         and c.lng between origin_lng - radius_miles / (69.0 * greatest(cos(radians(origin_lat)), 0.01))
                       and origin_lng + radius_miles / (69.0 * greatest(cos(radians(origin_lat)), 0.01))
         and 3958.8 * 2 * asin(sqrt(
               power(sin(radians(c.lat - origin_lat) / 2), 2)
               + cos(radians(origin_lat)) * cos(radians(c.lat)) * power(sin(radians(c.lng - origin_lng) / 2), 2)
             )) <= radius_miles
       )
     )
   order by
     case when sort_by_distance and origin_lat is not null and origin_lng is not null then
       power(c.lat - origin_lat, 2) + power((c.lng - origin_lng) * cos(radians(origin_lat)), 2)
     end asc nulls last,
     c.published_at desc nulls last;
$$;

grant execute on function public.search_cars(double precision, double precision, double precision, boolean) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- RPC: increment_car_views — safe counter without UPDATE permission on cars.
-- -----------------------------------------------------------------------------
create or replace function public.increment_car_views(p_car_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.cars set views = views + 1 where id = p_car_id and status in ('active', 'pending_sale');
$$;

revoke all on function public.increment_car_views(uuid) from public;
grant execute on function public.increment_car_views(uuid) to anon, authenticated;

-- -----------------------------------------------------------------------------
-- Storage bucket for car photos. Files live under "<user_id>/<car_id>/<file>"
-- so each user can only write inside their own folder.
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('car-photos', 'car-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Car photos are publicly readable"
  on storage.objects for select
  using (bucket_id = 'car-photos');

create policy "Users upload into their own folder"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update files in their own folder"
  on storage.objects for update to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete files in their own folder"
  on storage.objects for delete to authenticated
  using (bucket_id = 'car-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- Data API grants (new Supabase projects no longer auto-expose new tables)
-- -----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on public.profiles, public.platform_settings, public.cars, public.car_photos to anon, authenticated;
revoke all on public.car_private from anon;
grant select, insert, update, delete on public.car_private to authenticated;
grant insert, update, delete on public.car_photos to authenticated;
grant delete on public.cars to authenticated;
grant update on public.platform_settings to authenticated;  -- RLS limits this to admins
