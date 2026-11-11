-- =============================================================================
-- AutoPromo — Owner subscription: 30-day free trial, then $10/month per account.
-- Commissions go 100% to the promoter (platform fee set to 0%).
-- =============================================================================

alter table public.platform_settings
  add column owner_subscription_price_cents integer not null default 1000 check (owner_subscription_price_cents >= 0),
  add column owner_trial_days integer not null default 30 check (owner_trial_days between 0 and 365);

update public.platform_settings set platform_fee_percent = 0 where id = 1;
alter table public.platform_settings alter column platform_fee_percent set default 0;

-- -----------------------------------------------------------------------------
-- subscriptions — one row per owner. access_until decides whether the owner's
-- listings can be published/shown. Written only by triggers, admins (RPC) and
-- the Stripe webhook (service role).
-- -----------------------------------------------------------------------------
create table public.subscriptions (
  user_id                 uuid primary key references public.profiles (id) on delete cascade,
  status                  text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'canceled', 'comped')),
  trial_ends_at           timestamptz,
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  access_until            timestamptz not null,
  stripe_customer_id      text unique,
  stripe_subscription_id  text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index idx_subscriptions_access on public.subscriptions (access_until);

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

alter table public.subscriptions enable row level security;

create policy "Users read their own subscription"
  on public.subscriptions for select
  using (user_id = (select auth.uid()) or (select public.is_admin()));

revoke all on public.subscriptions from anon;
revoke insert, update, delete on public.subscriptions from authenticated;
grant select on public.subscriptions to authenticated;

-- Does this owner currently have access (trial or paid)?
create or replace function public.owner_has_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.subscriptions s where s.user_id = p_user_id and s.access_until > now());
$$;

-- -----------------------------------------------------------------------------
-- Publishing: the first time an owner publishes, their free trial starts.
-- After the trial, publishing requires an active subscription.
-- Runs after the moderation trigger (trg_cars_0_...) and before the rules.
-- -----------------------------------------------------------------------------
create or replace function public.cars_require_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  days int;
begin
  if new.status in ('active', 'pending_review')
     and (tg_op = 'INSERT' or old.status not in ('active', 'pending_review', 'pending_sale'))
     and auth.uid() is not null
     and not public.is_admin()
  then
    if not exists (select 1 from public.subscriptions where user_id = new.owner_id) then
      select owner_trial_days into days from public.platform_settings where id = 1;
      insert into public.subscriptions (user_id, status, trial_ends_at, access_until)
      values (new.owner_id, 'trial', now() + make_interval(days => days), now() + make_interval(days => days));
    elsif not public.owner_has_access(new.owner_id) then
      raise exception 'Your free trial has ended. Subscribe for $10/month in Billing to publish your listings.'
        using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_cars_1_require_subscription
  before insert or update of status on public.cars
  for each row execute function public.cars_require_subscription();

-- -----------------------------------------------------------------------------
-- Listings of owners without access disappear from the public site (search,
-- car pages, home). The owner still sees them in their dashboard.
-- -----------------------------------------------------------------------------
drop policy "Public sees live listings; owners see their own; admins see all" on public.cars;
create policy "Public sees live listings; owners see their own; admins see all"
  on public.cars for select
  using (
    (status in ('active', 'pending_sale', 'sold')
      and (status = 'sold' or public.owner_has_access(owner_id)))
    or owner_id = (select auth.uid())
    or (select public.is_admin())
  );

-- Existing owners with live listings get a fresh free trial so nothing vanishes.
insert into public.subscriptions (user_id, status, trial_ends_at, access_until)
select distinct c.owner_id, 'trial', now() + interval '30 days', now() + interval '30 days'
  from public.cars c
 where c.status in ('active', 'pending_sale', 'pending_review', 'paused')
on conflict (user_id) do nothing;

-- -----------------------------------------------------------------------------
-- Webhook helper (service role): apply a Stripe subscription state.
-- -----------------------------------------------------------------------------
create or replace function public.apply_stripe_subscription(
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_stripe_status text,
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  mapped text;
  access timestamptz;
  trial timestamptz;
begin
  mapped := case
    when p_stripe_status in ('active', 'trialing') then 'active'
    when p_stripe_status in ('past_due', 'unpaid', 'incomplete') then 'past_due'
    else 'canceled'
  end;
  select trial_ends_at into trial from public.subscriptions where user_id = p_user_id;
  access := case
    when mapped = 'active' then greatest(coalesce(p_period_end, now()), coalesce(trial, now()))
    when mapped = 'past_due' then coalesce(p_period_end, now()) + interval '3 days'  -- grace period
    else greatest(coalesce(p_period_end, now()), coalesce(trial, now()))            -- keeps access until paid period/trial ends
  end;

  insert into public.subscriptions (user_id, status, current_period_end, cancel_at_period_end, access_until, stripe_customer_id, stripe_subscription_id)
  values (p_user_id, mapped, p_period_end, coalesce(p_cancel_at_period_end, false), access, p_customer_id, p_subscription_id)
  on conflict (user_id) do update
    set status = excluded.status,
        current_period_end = excluded.current_period_end,
        cancel_at_period_end = excluded.cancel_at_period_end,
        access_until = excluded.access_until,
        stripe_customer_id = coalesce(excluded.stripe_customer_id, public.subscriptions.stripe_customer_id),
        stripe_subscription_id = coalesce(excluded.stripe_subscription_id, public.subscriptions.stripe_subscription_id);
end;
$$;

-- -----------------------------------------------------------------------------
-- Admin: give an owner free access until a date (e.g. partners, support cases)
-- -----------------------------------------------------------------------------
create or replace function public.admin_comp_subscription(p_user_id uuid, p_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  insert into public.subscriptions (user_id, status, access_until)
  values (p_user_id, 'comped', p_until)
  on conflict (user_id) do update set status = 'comped', access_until = excluded.access_until;
end;
$$;

-- Admin stats now include subscribers
create or replace function public.admin_subscription_stats()
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform public.assert_admin();
  return json_build_object(
    'trialing', (select count(*) from public.subscriptions where status = 'trial' and access_until > now()),
    'paying', (select count(*) from public.subscriptions where status = 'active' and access_until > now()),
    'past_due', (select count(*) from public.subscriptions where status = 'past_due'),
    'expired', (select count(*) from public.subscriptions where access_until <= now()),
    'mrr_cents', (select count(*) from public.subscriptions where status = 'active' and access_until > now())
                 * (select owner_subscription_price_cents from public.platform_settings where id = 1)
  );
end;
$$;

-- Permissions
revoke execute on function public.cars_require_subscription() from public, anon, authenticated;
revoke execute on function public.apply_stripe_subscription(uuid, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_stripe_subscription(uuid, text, text, text, timestamptz, boolean) to service_role;
grant execute on function public.owner_has_access(uuid) to anon, authenticated;
revoke execute on function public.admin_comp_subscription(uuid, timestamptz) from public, anon;
grant execute on function public.admin_comp_subscription(uuid, timestamptz) to authenticated;
revoke execute on function public.admin_subscription_stats() from public, anon;
grant execute on function public.admin_subscription_stats() to authenticated;
