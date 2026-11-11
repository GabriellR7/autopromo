-- =============================================================================
-- AutoPromo — Phase 5: reviews, reports, listing moderation and admin tools
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Settings & listing moderation
-- -----------------------------------------------------------------------------
alter table public.platform_settings add column require_listing_approval boolean not null default false;
alter table public.cars add column moderation_note text check (char_length(moderation_note) <= 500);

-- When approval is required, "publish" sends the listing to the review queue.
create or replace function public.cars_moderation_queue()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active'
     and (tg_op = 'INSERT' or old.status in ('draft', 'pending_review'))
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and (select require_listing_approval from public.platform_settings where id = 1)
     and not public.is_admin()
     and coalesce(current_setting('app.admin_approving', true), '') <> 'on'
     and auth.uid() is not null
  then
    new.status := 'pending_review';
    new.published_at := null;
  end if;
  return new;
end;
$$;

-- Runs before cars_enforce_rules (alphabetical order of trigger names), so the
-- state/price/location checks still apply when the admin approves.
create trigger trg_cars_0_moderation_queue
  before insert or update of status on public.cars
  for each row execute function public.cars_moderation_queue();

-- Owners may move a rejected/pending listing back to draft, but never set
-- pending_review or bypass the queue themselves (handled by the trigger above).

-- -----------------------------------------------------------------------------
-- Reviews (after a sale with a credited promoter)
-- -----------------------------------------------------------------------------
create table public.reviews (
  id           uuid primary key default gen_random_uuid(),
  sale_id      uuid not null references public.sales (id) on delete cascade,
  reviewer_id  uuid not null references public.profiles (id) on delete cascade,
  reviewee_id  uuid not null references public.profiles (id) on delete cascade,
  role         text not null check (role in ('owner_to_promoter', 'promoter_to_owner')),
  rating       smallint not null check (rating between 1 and 5),
  comment      text check (char_length(comment) <= 1000),
  hidden       boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (sale_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create index idx_reviews_reviewee on public.reviews (reviewee_id, created_at desc);

alter table public.reviews enable row level security;

create policy "Visible reviews are public"
  on public.reviews for select
  using (not hidden or reviewer_id = auth.uid() or public.is_admin());

revoke all on public.reviews from anon;
grant select on public.reviews to anon;
revoke insert, update, delete on public.reviews from authenticated;
grant select on public.reviews to authenticated;

create or replace function public.submit_review(p_sale_id uuid, p_rating int, p_comment text default null)
returns public.reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sales;
  promoter uuid;
  reviewee uuid;
  r_role text;
  result public.reviews;
begin
  select * into s from public.sales where id = p_sale_id;
  select cm.promoter_id into promoter from public.commissions cm
   where cm.sale_id = s.id and cm.status <> 'cancelled' limit 1;
  if s.id is null or promoter is null then
    raise exception 'Only sales with a credited promoter can be reviewed.' using errcode = 'P0001';
  end if;

  if auth.uid() = s.owner_id then
    reviewee := promoter; r_role := 'owner_to_promoter';
  elsif auth.uid() = promoter then
    reviewee := s.owner_id; r_role := 'promoter_to_owner';
  else
    raise exception 'You were not part of this sale.' using errcode = 'P0001';
  end if;

  if p_rating not between 1 and 5 then
    raise exception 'Rating must be between 1 and 5.' using errcode = 'P0001';
  end if;

  insert into public.reviews (sale_id, reviewer_id, reviewee_id, role, rating, comment)
  values (s.id, auth.uid(), reviewee, r_role, p_rating, nullif(trim(p_comment), ''))
  on conflict (sale_id, reviewer_id) do update set rating = excluded.rating, comment = excluded.comment, created_at = now()
  returning * into result;
  return result;
end;
$$;

-- Public stats for a user: rating, reviews, completed sales as promoter.
create or replace function public.user_public_stats(p_user_id uuid)
returns json
language sql
stable
security definer
set search_path = ''
as $$
  select json_build_object(
    'rating', (select round(avg(rating)::numeric, 1) from public.reviews where reviewee_id = p_user_id and not hidden),
    'reviews', (select count(*) from public.reviews where reviewee_id = p_user_id and not hidden),
    'promoter_sales', (select count(*) from public.commissions where promoter_id = p_user_id and status = 'paid'),
    'cars_sold', (select count(*) from public.sales where owner_id = p_user_id)
  );
$$;

-- Reviews the current user can still leave
create or replace function public.my_pending_reviews()
returns table (sale_id uuid, car_title text, other_name text, role text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, c.year || ' ' || c.make || ' ' || c.model,
         case when s.owner_id = auth.uid() then pp.full_name else op.full_name end,
         case when s.owner_id = auth.uid() then 'owner_to_promoter' else 'promoter_to_owner' end
    from public.sales s
    join public.cars c on c.id = s.car_id
    join public.commissions cm on cm.sale_id = s.id and cm.status <> 'cancelled'
    join public.profiles pp on pp.id = cm.promoter_id
    join public.profiles op on op.id = s.owner_id
   where auth.uid() in (s.owner_id, cm.promoter_id)
     and not exists (select 1 from public.reviews r where r.sale_id = s.id and r.reviewer_id = auth.uid())
     and s.created_at > now() - interval '60 days';
$$;

-- -----------------------------------------------------------------------------
-- Reports
-- -----------------------------------------------------------------------------
create type public.report_status as enum ('open', 'dismissed', 'actioned');

create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid not null references public.profiles (id) on delete cascade,
  target_type  text not null check (target_type in ('car', 'user')),
  target_id    uuid not null,
  reason       text not null check (reason in ('scam', 'misleading', 'offensive', 'spam', 'not_owner', 'sold', 'other')),
  details      text check (char_length(details) <= 1000),
  status       public.report_status not null default 'open',
  admin_note   text,
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null
);

create index idx_reports_status on public.reports (status, created_at desc);

alter table public.reports enable row level security;

create policy "Reporter and admins see reports"
  on public.reports for select
  using (reporter_id = auth.uid() or public.is_admin());

revoke all on public.reports from anon;
revoke insert, update, delete on public.reports from authenticated;
grant select on public.reports to authenticated;

create or replace function public.report_content(p_target_type text, p_target_id uuid, p_reason text, p_details text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  rid uuid;
begin
  if auth.uid() is null then
    raise exception 'Please sign in to report.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.reports where reporter_id = auth.uid() and created_at > now() - interval '1 day') >= 10 then
    raise exception 'You have sent too many reports today.' using errcode = 'P0001';
  end if;
  if p_target_type = 'car' and not exists (select 1 from public.cars where id = p_target_id) then
    raise exception 'Listing not found.' using errcode = 'P0001';
  end if;
  if p_target_type = 'user' and not exists (select 1 from public.profiles where id = p_target_id) then
    raise exception 'User not found.' using errcode = 'P0001';
  end if;
  if p_target_type = 'user' and p_target_id = auth.uid() then
    raise exception 'You cannot report yourself.' using errcode = 'P0001';
  end if;
  -- One open report per person per target
  select id into rid from public.reports
   where reporter_id = auth.uid() and target_type = p_target_type and target_id = p_target_id and status = 'open';
  if rid is not null then
    return rid;
  end if;
  insert into public.reports (reporter_id, target_type, target_id, reason, details)
  values (auth.uid(), p_target_type, p_target_id, p_reason, nullif(trim(p_details), ''))
  returning id into rid;
  return rid;
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin helpers (every function checks is_admin())
-- -----------------------------------------------------------------------------
create or replace function public.assert_admin()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Admins only.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.admin_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'promoters', (select count(*) from public.profiles where is_promoter),
    'active_listings', (select count(*) from public.cars where status = 'active'),
    'pending_review', (select count(*) from public.cars where status = 'pending_review'),
    'sold', (select count(*) from public.sales),
    'sales_volume', (select coalesce(sum(sale_price), 0) from public.sales),
    'commissions_pending_cents', (select coalesce(sum(amount_cents), 0) from public.commissions where status = 'pending'),
    'commissions_paid_cents', (select coalesce(sum(amount_cents), 0) from public.commissions where status = 'paid'),
    'platform_revenue_cents', (select coalesce(sum(platform_fee_cents), 0) from public.commissions where status = 'paid'),
    'open_disputes', (select count(*) from public.disputes where status = 'open'),
    'open_reports', (select count(*) from public.reports where status = 'open'),
    'conversations', (select count(*) from public.conversations),
    'clicks_7d', (select count(*) from public.referral_clicks where created_at > now() - interval '7 days')
  );
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (
  id uuid, email text, full_name text, avatar_url text, created_at timestamptz, last_sign_in_at timestamptz,
  is_owner boolean, is_promoter boolean, is_admin boolean, identity_verified boolean, suspended boolean,
  promoter_level public.promoter_level, listings bigint, promotions bigint, open_reports bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select p.id, u.email::text, p.full_name, p.avatar_url, p.created_at, u.last_sign_in_at,
           p.is_owner, p.is_promoter, p.is_admin, p.identity_verified, p.suspended, p.promoter_level,
           (select count(*) from public.cars c where c.owner_id = p.id),
           (select count(*) from public.promotions pr where pr.promoter_id = p.id and pr.active),
           (select count(*) from public.reports r where r.target_type = 'user' and r.target_id = p.id and r.status = 'open')
      from public.profiles p
      join auth.users u on u.id = p.id
     where p_search is null or p_search = ''
        or p.full_name ilike '%' || p_search || '%' or u.email ilike '%' || p_search || '%'
     order by p.created_at desc
     limit least(p_limit, 200) offset greatest(p_offset, 0);
end;
$$;

create or replace function public.admin_update_user(
  p_user_id uuid,
  p_identity_verified boolean default null,
  p_suspended boolean default null,
  p_is_admin boolean default null,
  p_promoter_level public.promoter_level default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_user_id = auth.uid() and (p_suspended is true or p_is_admin is false) then
    raise exception 'You cannot suspend or demote yourself.' using errcode = 'P0001';
  end if;
  update public.profiles
     set identity_verified = coalesce(p_identity_verified, identity_verified),
         suspended = coalesce(p_suspended, suspended),
         is_admin = coalesce(p_is_admin, is_admin),
         promoter_level = coalesce(p_promoter_level, promoter_level)
   where id = p_user_id;
  -- Suspending hides the user's live listings and stops their promotions
  if p_suspended is true then
    update public.cars set status = 'paused' where owner_id = p_user_id and status in ('active', 'pending_review', 'pending_sale');
    update public.promotions set active = false, ended_at = now() where promoter_id = p_user_id and active;
  end if;
end;
$$;

create or replace function public.admin_moderate_car(p_car_id uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  car public.cars;
begin
  perform public.assert_admin();
  select * into car from public.cars where id = p_car_id;
  if car.id is null then
    raise exception 'Listing not found.' using errcode = 'P0001';
  end if;
  if p_action = 'approve' then
    perform set_config('app.admin_approving', 'on', true);
    update public.cars set status = 'active', moderation_note = null where id = car.id;
    perform set_config('app.admin_approving', 'off', true);
  elsif p_action = 'reject' then
    update public.cars set status = 'draft', moderation_note = coalesce(nullif(trim(p_note), ''), 'Your listing needs changes before it can be published.')
     where id = car.id;
  elsif p_action = 'remove' then
    if car.status = 'sold' then
      raise exception 'Sold listings cannot be removed.' using errcode = 'P0001';
    end if;
    update public.cars set status = 'paused', moderation_note = coalesce(nullif(trim(p_note), ''), 'Removed by AutoPromo for violating our rules.')
     where id = car.id;
    update public.promotions set active = false, ended_at = now() where car_id = car.id and active;
  else
    raise exception 'Unknown action.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_resolve_dispute(p_dispute_id uuid, p_decision text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  d public.disputes;
begin
  perform public.assert_admin();
  select * into d from public.disputes where id = p_dispute_id;
  if d.id is null or d.status <> 'open' then
    raise exception 'Dispute not found or already resolved.' using errcode = 'P0001';
  end if;
  if char_length(trim(coalesce(p_note, ''))) < 5 then
    raise exception 'Write a short note explaining the decision.' using errcode = 'P0001';
  end if;
  if p_decision = 'promoter' then
    perform public.create_commission(d.sale_id, d.promotion_id, 'dispute');
    update public.disputes set status = 'resolved_promoter', resolution_note = trim(p_note), resolved_at = now() where id = d.id;
  elsif p_decision = 'owner' then
    update public.disputes set status = 'resolved_owner', resolution_note = trim(p_note), resolved_at = now() where id = d.id;
  else
    raise exception 'Unknown decision.' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.admin_resolve_report(p_report_id uuid, p_status public.report_status, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.reports
     set status = p_status, admin_note = nullif(trim(p_note), ''), resolved_at = now(), resolved_by = auth.uid()
   where id = p_report_id;
end;
$$;

create or replace function public.admin_set_commission_status(p_commission_id uuid, p_status public.commission_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  if p_status = 'paid' then
    update public.commissions set status = 'paid', paid_at = coalesce(paid_at, now()) where id = p_commission_id;
  else
    update public.commissions set status = p_status where id = p_commission_id and status <> 'paid';
  end if;
end;
$$;

create or replace function public.admin_hide_review(p_review_id uuid, p_hidden boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  update public.reviews set hidden = p_hidden where id = p_review_id;
end;
$$;

-- Report list with readable targets
create or replace function public.admin_reports(p_status public.report_status default 'open')
returns table (
  id uuid, target_type text, target_id uuid, target_label text, target_public_id bigint, reason text, details text,
  status public.report_status, admin_note text, created_at timestamptz, reporter_name text, reporter_email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return query
    select r.id, r.target_type, r.target_id,
           case when r.target_type = 'car' then (select c.year || ' ' || c.make || ' ' || c.model from public.cars c where c.id = r.target_id)
                else (select coalesce(p.full_name, 'User') from public.profiles p where p.id = r.target_id) end,
           case when r.target_type = 'car' then (select c.public_id from public.cars c where c.id = r.target_id) end,
           r.reason, r.details, r.status, r.admin_note, r.created_at, rp.full_name, u.email::text
      from public.reports r
      join public.profiles rp on rp.id = r.reporter_id
      join auth.users u on u.id = r.reporter_id
     where r.status = p_status
     order by r.created_at desc
     limit 200;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.cars_moderation_queue() from public, anon, authenticated;
revoke execute on function public.assert_admin() from public, anon;
grant execute on function public.assert_admin() to authenticated;
grant execute on function public.user_public_stats(uuid) to anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.submit_review(uuid, int, text)',
    'public.my_pending_reviews()',
    'public.report_content(text, uuid, text, text)',
    'public.admin_stats()',
    'public.admin_list_users(text, int, int)',
    'public.admin_update_user(uuid, boolean, boolean, boolean, public.promoter_level)',
    'public.admin_moderate_car(uuid, text, text)',
    'public.admin_resolve_dispute(uuid, text, text)',
    'public.admin_resolve_report(uuid, public.report_status, text)',
    'public.admin_set_commission_status(uuid, public.commission_status)',
    'public.admin_hide_review(uuid, boolean)',
    'public.admin_reports(public.report_status)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
