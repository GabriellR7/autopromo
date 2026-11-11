-- =============================================================================
-- AutoPromo — Phase 3: data access for the e-mail notification Edge Function.
-- These functions are callable ONLY with the service_role key (server-side).
-- =============================================================================

-- Unread messages older than 10 minutes that haven't triggered an e-mail yet,
-- grouped per recipient + conversation.
create or replace function public.pending_message_notifications()
returns table (
  recipient_id uuid,
  recipient_email text,
  recipient_name text,
  sender_name text,
  conversation_id uuid,
  car_title text,
  message_count bigint,
  last_preview text,
  message_ids uuid[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select rp.id, u.email, rp.full_name, sp.full_name, c.id,
         car.year || ' ' || car.make || ' ' || car.model,
         count(m.id),
         (array_agg(left(coalesce(nullif(m.body, ''), '📷 Photo'), 160) order by m.created_at desc))[1],
         array_agg(m.id)
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
    join public.cars car on car.id = c.car_id
    join public.profiles sp on sp.id = m.sender_id
    join public.profiles rp on rp.id = case when m.sender_id = c.initiator_id then c.recipient_id else c.initiator_id end
    join auth.users u on u.id = rp.id
   where m.read_at is null
     and m.email_notified_at is null
     and m.created_at < now() - interval '10 minutes'
     and m.created_at > now() - interval '3 days'
   group by rp.id, u.email, rp.full_name, sp.full_name, c.id, car.id
   limit 200;
$$;

create or replace function public.mark_messages_notified(p_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages set email_notified_at = now() where id = any (p_ids);
$$;

-- Confirmed visits that need a 24h or 1h reminder.
create or replace function public.due_visit_reminders()
returns table (
  visit_id uuid,
  kind text,
  scheduled_at timestamptz,
  conversation_id uuid,
  car_title text,
  car_city text,
  car_state text,
  buyer_email text,
  buyer_name text,
  owner_email text,
  owner_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id,
         case when v.scheduled_at <= now() + interval '75 minutes' then '1h' else '24h' end,
         v.scheduled_at, v.conversation_id,
         car.year || ' ' || car.make || ' ' || car.model, car.city, car.state,
         bu.email, bp.full_name, ou.email, op.full_name
    from public.visits v
    join public.cars car on car.id = v.car_id
    join public.profiles bp on bp.id = v.buyer_id
    join auth.users bu on bu.id = v.buyer_id
    join public.profiles op on op.id = v.owner_id
    join auth.users ou on ou.id = v.owner_id
   where v.status = 'confirmed'
     and v.scheduled_at > now()
     and (
       (v.scheduled_at <= now() + interval '75 minutes' and v.reminder_1h_sent_at is null)
       or (v.scheduled_at <= now() + interval '24 hours' and v.scheduled_at > now() + interval '75 minutes' and v.reminder_24h_sent_at is null)
     );
$$;

create or replace function public.mark_visit_reminder(p_visit_id uuid, p_kind text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.visits
     set reminder_1h_sent_at  = case when p_kind = '1h'  then now() else reminder_1h_sent_at end,
         reminder_24h_sent_at = case when p_kind in ('1h', '24h') then coalesce(reminder_24h_sent_at, now()) else reminder_24h_sent_at end
   where id = p_visit_id;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.pending_message_notifications()',
    'public.mark_messages_notified(uuid[])',
    'public.due_visit_reminders()',
    'public.mark_visit_reminder(uuid, text)'
  ] loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
