-- =============================================================================
-- Etapa 1 — Vehicle history: signed-in buyers can reveal the full VIN of a
-- public listing to run a free history / recall check. Every reveal is logged
-- and limited (30 different cars per person per day) to stop scraping.
-- =============================================================================

create table public.vin_reveals (
  car_id      uuid not null references public.cars (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (car_id, user_id)
);

create index idx_vin_reveals_user_time on public.vin_reveals (user_id, created_at desc);

alter table public.vin_reveals enable row level security;
revoke all on public.vin_reveals from anon, authenticated;
-- No client access: written and read only by the function below.

create or replace function public.reveal_car_vin(p_car_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  v_vin text;
  v_owner uuid;
  v_status public.car_status;
  recent int;
begin
  if uid is null then
    raise exception 'Sign in to see the full VIN.';
  end if;
  if exists (select 1 from public.profiles where id = uid and suspended) then
    raise exception 'Account not allowed.';
  end if;

  select c.owner_id, c.status, p.vin
    into v_owner, v_status, v_vin
    from public.cars c
    left join public.car_private p on p.car_id = c.id
   where c.id = p_car_id;

  if v_owner is null then
    raise exception 'Listing not found.';
  end if;
  if v_owner <> uid and not public.is_admin() then
    if v_status not in ('active', 'pending_sale', 'sold')
       or (v_status <> 'sold' and not public.owner_has_access(v_owner)) then
      raise exception 'Listing not found.';
    end if;
  end if;
  if v_vin is null then
    return null;
  end if;

  if v_owner <> uid then
    if not exists (select 1 from public.vin_reveals where car_id = p_car_id and user_id = uid) then
      select count(*) into recent
        from public.vin_reveals
       where user_id = uid and created_at > now() - interval '24 hours';
      if recent >= 30 then
        raise exception 'You''ve looked up a lot of VINs today. Please try again tomorrow.';
      end if;
      insert into public.vin_reveals (car_id, user_id) values (p_car_id, uid);
    end if;
  end if;

  return v_vin;
end;
$$;

revoke execute on function public.reveal_car_vin(uuid) from public, anon;
grant execute on function public.reveal_car_vin(uuid) to authenticated;
