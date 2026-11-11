-- =============================================================================
-- AutoPromo — Phase 3: real-time chat (with anti-bypass), visits, contacts
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Private contact info (phone). Only the user can read/write it directly; the
-- other party sees it through get_contact_details() after a visit is confirmed.
-- -----------------------------------------------------------------------------
create table public.profile_contacts (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  phone       text check (phone is null or phone ~ '^\+?[0-9 ()\-.]{7,20}$'),
  updated_at  timestamptz not null default now()
);

create trigger trg_profile_contacts_updated_at
  before update on public.profile_contacts
  for each row execute function public.set_updated_at();

alter table public.profile_contacts enable row level security;

create policy "Users manage their own contact info"
  on public.profile_contacts for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.profile_contacts from anon;
grant select, insert, update, delete on public.profile_contacts to authenticated;

-- -----------------------------------------------------------------------------
-- conversations: always between two people about one car
-- -----------------------------------------------------------------------------
create table public.conversations (
  id                    uuid primary key default gen_random_uuid(),
  car_id                uuid not null references public.cars (id) on delete cascade,
  initiator_id          uuid not null references public.profiles (id) on delete cascade,
  recipient_id          uuid not null references public.profiles (id) on delete cascade,
  promotion_id          uuid references public.promotions (id) on delete set null, -- referral attribution
  contact_unlocked_at   timestamptz,
  last_message_at       timestamptz,
  last_message_preview  text,
  created_at            timestamptz not null default now(),
  unique (car_id, initiator_id, recipient_id),
  check (initiator_id <> recipient_id)
);

create index idx_conversations_initiator on public.conversations (initiator_id, last_message_at desc);
create index idx_conversations_recipient on public.conversations (recipient_id, last_message_at desc);
create index idx_conversations_promotion on public.conversations (promotion_id);

alter table public.conversations enable row level security;

create policy "Participants see their conversations"
  on public.conversations for select
  using (auth.uid() in (initiator_id, recipient_id) or public.is_admin());

-- Promoters can see conversations attributed to their referral (read-only metadata).
create policy "Promoter sees conversations they referred"
  on public.conversations for select
  using (exists (select 1 from public.promotions p where p.id = promotion_id and p.promoter_id = auth.uid()));

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create table public.messages (
  id                 uuid primary key default gen_random_uuid(),
  conversation_id    uuid not null references public.conversations (id) on delete cascade,
  sender_id          uuid not null references public.profiles (id) on delete cascade,
  body               text check (char_length(body) <= 2000),
  attachment_path    text,
  masked             boolean not null default false,
  read_at            timestamptz,
  email_notified_at  timestamptz,
  created_at         timestamptz not null default now(),
  check (coalesce(length(trim(body)), 0) > 0 or attachment_path is not null)
);

create index idx_messages_conversation on public.messages (conversation_id, created_at);
create index idx_messages_unread on public.messages (conversation_id, read_at) where read_at is null;

alter table public.messages enable row level security;

create policy "Participants read messages"
  on public.messages for select
  using (exists (
    select 1 from public.conversations c
     where c.id = conversation_id and (auth.uid() in (c.initiator_id, c.recipient_id) or public.is_admin())
  ));

create policy "Participants send messages as themselves"
  on public.messages for insert
  with check (
    sender_id = auth.uid()
    and exists (select 1 from public.conversations c
                 where c.id = conversation_id and auth.uid() in (c.initiator_id, c.recipient_id))
    and not exists (select 1 from public.profiles p where p.id = auth.uid() and p.suspended)
  );

revoke all on public.messages from anon;
revoke insert, update, delete on public.messages from authenticated;
grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, body, attachment_path) on public.messages to authenticated;

revoke all on public.conversations from anon;
revoke insert, update, delete on public.conversations from authenticated;
grant select on public.conversations to authenticated;

-- -----------------------------------------------------------------------------
-- Anti-bypass: hide phone numbers, emails and links until contact is unlocked.
-- Runs in the database, so it can't be skipped by a modified browser.
-- -----------------------------------------------------------------------------
create or replace function public.mask_contact_info(input text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 input,
                 '[A-Za-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[A-Za-z0-9.-]+\s*(\.|\(dot\)|\[dot\])\s*[A-Za-z]{2,}', '[email hidden]', 'gi'),
               '(https?://|www\.)\S+', '[link hidden]', 'gi'),
             '\m[A-Za-z0-9-]+\.(com|net|org|io|me|co|us|app|link|ly|gg|info|biz)\M(/\S*)?', '[link hidden]', 'gi'),
           '(\+?\d[\s().-]*){7,}\d', '[phone hidden]', 'g');
$$;

create or replace function public.messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.conversations;
  cleaned text;
begin
  select * into conv from public.conversations where id = new.conversation_id;
  if new.body is not null then
    new.body := trim(new.body);
    if conv.contact_unlocked_at is null then
      cleaned := public.mask_contact_info(new.body);
      new.masked := cleaned is distinct from new.body;
      new.body := cleaned;
    end if;
  end if;
  if new.attachment_path is not null
     and (storage.foldername(new.attachment_path))[1] is distinct from new.conversation_id::text then
    raise exception 'Invalid attachment.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger trg_messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

create or replace function public.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
     set last_message_at = new.created_at,
         last_message_preview = left(coalesce(nullif(new.body, ''), '📷 Photo'), 140)
   where id = new.conversation_id;
  return new;
end;
$$;

create trigger trg_messages_after_insert
  after insert on public.messages
  for each row execute function public.messages_after_insert();

-- -----------------------------------------------------------------------------
-- visits
-- -----------------------------------------------------------------------------
create type public.visit_status as enum ('proposed', 'confirmed', 'declined', 'cancelled', 'completed');

create table public.visits (
  id                    uuid primary key default gen_random_uuid(),
  conversation_id       uuid not null references public.conversations (id) on delete cascade,
  car_id                uuid not null references public.cars (id) on delete cascade,
  buyer_id              uuid not null references public.profiles (id) on delete cascade,
  owner_id              uuid not null references public.profiles (id) on delete cascade,
  scheduled_at          timestamptz not null,
  note                  text check (char_length(note) <= 500),
  status                public.visit_status not null default 'proposed',
  created_at            timestamptz not null default now(),
  responded_at          timestamptz,
  reminder_24h_sent_at  timestamptz,
  reminder_1h_sent_at   timestamptz
);

create index idx_visits_conversation on public.visits (conversation_id, created_at desc);
create index idx_visits_upcoming on public.visits (status, scheduled_at);

alter table public.visits enable row level security;

create policy "Buyer, owner and admins see visits"
  on public.visits for select
  using (auth.uid() in (buyer_id, owner_id) or public.is_admin());

create policy "Promoter sees visits for conversations they referred"
  on public.visits for select
  using (exists (
    select 1 from public.conversations c join public.promotions p on p.id = c.promotion_id
     where c.id = conversation_id and p.promoter_id = auth.uid()
  ));

revoke all on public.visits from anon;
revoke insert, update, delete on public.visits from authenticated;
grant select on public.visits to authenticated;

-- -----------------------------------------------------------------------------
-- RPC: start_conversation
--   * buyer → owner (default)       * buyer → promoter of the car
--   * owner ↔ promoter of the car   Referral attribution comes from p_ref_code.
-- -----------------------------------------------------------------------------
create or replace function public.start_conversation(
  p_car_id uuid,
  p_recipient_id uuid default null,
  p_ref_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  car public.cars;
  recipient uuid;
  promo_id uuid;
  conv_id uuid;
begin
  if me is null then
    raise exception 'Please sign in first.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.profiles where id = me and suspended) then
    raise exception 'Your account is suspended.' using errcode = 'P0001';
  end if;

  select * into car from public.cars where id = p_car_id;
  if car.id is null or (car.status not in ('active', 'pending_sale') and car.owner_id <> me) then
    raise exception 'This car is not available.' using errcode = 'P0001';
  end if;

  recipient := coalesce(p_recipient_id, car.owner_id);
  if recipient = me then
    raise exception 'You cannot message yourself.' using errcode = 'P0001';
  end if;

  -- Recipient must be the owner or an active promoter of this car.
  -- Owner → promoter is allowed only for that car's promoters.
  if recipient <> car.owner_id
     and not exists (select 1 from public.promotions where car_id = p_car_id and promoter_id = recipient and active) then
    raise exception 'You can only message the owner or a promoter of this car.' using errcode = 'P0001';
  end if;

  -- Referral attribution (buyer conversations only)
  if p_ref_code is not null and me <> car.owner_id then
    select id into promo_id from public.promotions
     where referral_code = p_ref_code and car_id = p_car_id and active and promoter_id <> me;
  end if;
  if promo_id is null and recipient <> car.owner_id and me <> car.owner_id then
    -- buyer talking directly to a promoter → that promoter gets the credit
    select id into promo_id from public.promotions where car_id = p_car_id and promoter_id = recipient and active;
  end if;

  -- Re-use an existing conversation between the same two people about this car
  select id into conv_id from public.conversations
   where car_id = p_car_id
     and ((initiator_id = me and recipient_id = recipient) or (initiator_id = recipient and recipient_id = me));

  if conv_id is null then
    insert into public.conversations (car_id, initiator_id, recipient_id, promotion_id)
    values (p_car_id, me, recipient, promo_id)
    returning id into conv_id;
  elsif promo_id is not null then
    update public.conversations set promotion_id = coalesce(promotion_id, promo_id) where id = conv_id;
  end if;

  return conv_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: mark_conversation_read
-- -----------------------------------------------------------------------------
create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.messages m
     set read_at = now()
    from public.conversations c
   where c.id = p_conversation_id
     and m.conversation_id = c.id
     and auth.uid() in (c.initiator_id, c.recipient_id)
     and m.sender_id <> auth.uid()
     and m.read_at is null;
$$;

-- -----------------------------------------------------------------------------
-- RPC: unread_message_count (header badge)
-- -----------------------------------------------------------------------------
create or replace function public.unread_message_count()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
    from public.messages m
    join public.conversations c on c.id = m.conversation_id
   where auth.uid() in (c.initiator_id, c.recipient_id)
     and m.sender_id <> auth.uid()
     and m.read_at is null;
$$;

-- -----------------------------------------------------------------------------
-- RPC: propose_visit — the non-owner participant proposes a date/time
-- -----------------------------------------------------------------------------
create or replace function public.propose_visit(p_conversation_id uuid, p_scheduled_at timestamptz, p_note text default null)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  conv public.conversations;
  car public.cars;
  v public.visits;
  buyer uuid;
begin
  select * into conv from public.conversations where id = p_conversation_id and auth.uid() in (initiator_id, recipient_id);
  if conv.id is null then
    raise exception 'Conversation not found.' using errcode = 'P0001';
  end if;
  select * into car from public.cars where id = conv.car_id;
  if car.owner_id not in (conv.initiator_id, conv.recipient_id) then
    raise exception 'Visits are scheduled between the buyer and the owner.' using errcode = 'P0001';
  end if;
  if auth.uid() = car.owner_id then
    raise exception 'Only the buyer can propose a visit.' using errcode = 'P0001';
  end if;
  if car.status not in ('active', 'pending_sale') then
    raise exception 'This car is no longer available.' using errcode = 'P0001';
  end if;
  if p_scheduled_at < now() + interval '1 hour' or p_scheduled_at > now() + interval '60 days' then
    raise exception 'Choose a time between 1 hour and 60 days from now.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.visits where conversation_id = conv.id and status = 'proposed') then
    raise exception 'You already have a pending visit request. Wait for the owner to respond or cancel it.' using errcode = 'P0001';
  end if;

  buyer := auth.uid();
  insert into public.visits (conversation_id, car_id, buyer_id, owner_id, scheduled_at, note)
  values (conv.id, car.id, buyer, car.owner_id, p_scheduled_at, nullif(trim(p_note), ''))
  returning * into v;

  insert into public.messages (conversation_id, sender_id, body)
  values (conv.id, buyer, '📅 Visit requested for ' || to_char(p_scheduled_at at time zone 'America/Chicago', 'MM/DD/YYYY "at" HH12:MI AM') || ' (Central Time)');

  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: respond_visit — owner confirms/declines; either side can cancel.
-- Confirming unlocks contact details for that conversation.
-- -----------------------------------------------------------------------------
create or replace function public.respond_visit(p_visit_id uuid, p_action text)
returns public.visits
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.visits;
  msg text;
begin
  select * into v from public.visits where id = p_visit_id and auth.uid() in (buyer_id, owner_id);
  if v.id is null then
    raise exception 'Visit not found.' using errcode = 'P0001';
  end if;

  if p_action in ('confirm', 'decline') then
    if auth.uid() <> v.owner_id then
      raise exception 'Only the owner can confirm or decline.' using errcode = 'P0001';
    end if;
    if v.status <> 'proposed' then
      raise exception 'This visit is already %.', v.status using errcode = 'P0001';
    end if;
    update public.visits
       set status = case when p_action = 'confirm' then 'confirmed'::public.visit_status else 'declined' end,
           responded_at = now()
     where id = v.id returning * into v;
    if p_action = 'confirm' then
      update public.conversations set contact_unlocked_at = coalesce(contact_unlocked_at, now()) where id = v.conversation_id;
      msg := '✅ Visit confirmed for ' || to_char(v.scheduled_at at time zone 'America/Chicago', 'MM/DD/YYYY "at" HH12:MI AM') || ' (Central Time). Contact details are now shared.';
    else
      msg := '❌ The owner declined this visit time. Feel free to suggest another one.';
    end if;
  elsif p_action = 'cancel' then
    if v.status not in ('proposed', 'confirmed') then
      raise exception 'This visit can no longer be cancelled.' using errcode = 'P0001';
    end if;
    update public.visits set status = 'cancelled', responded_at = now() where id = v.id returning * into v;
    msg := '🚫 Visit cancelled.';
  elsif p_action = 'complete' then
    if auth.uid() <> v.owner_id or v.status <> 'confirmed' then
      raise exception 'Only the owner can mark a confirmed visit as completed.' using errcode = 'P0001';
    end if;
    update public.visits set status = 'completed', responded_at = now() where id = v.id returning * into v;
    msg := '🚗 Visit marked as completed.';
  else
    raise exception 'Unknown action.' using errcode = 'P0001';
  end if;

  insert into public.messages (conversation_id, sender_id, body) values (v.conversation_id, auth.uid(), msg);
  return v;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: get_contact_details — the other person's phone/email, once unlocked
-- -----------------------------------------------------------------------------
create or replace function public.get_contact_details(p_conversation_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  conv public.conversations;
  other uuid;
begin
  select * into conv from public.conversations where id = p_conversation_id and auth.uid() in (initiator_id, recipient_id);
  if conv.id is null or conv.contact_unlocked_at is null then
    return null;
  end if;
  other := case when conv.initiator_id = auth.uid() then conv.recipient_id else conv.initiator_id end;
  return (
    select json_build_object('name', p.full_name, 'email', u.email, 'phone', pc.phone)
      from public.profiles p
      join auth.users u on u.id = p.id
      left join public.profile_contacts pc on pc.user_id = p.id
     where p.id = other
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: my_conversations — inbox with the other person, car and unread count
-- -----------------------------------------------------------------------------
create or replace function public.my_conversations()
returns table (
  id uuid,
  car_id uuid,
  car_public_id bigint,
  car_title text,
  car_city text,
  car_state char(2),
  car_cover text,
  car_owner_id uuid,
  other_id uuid,
  other_name text,
  other_avatar text,
  other_role text,
  promotion_id uuid,
  contact_unlocked boolean,
  last_message_at timestamptz,
  last_message_preview text,
  unread integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, car.id, car.public_id, car.year || ' ' || car.make || ' ' || car.model, car.city, car.state,
         (select ph.url from public.car_photos ph where ph.car_id = car.id order by ph.position limit 1),
         car.owner_id,
         o.id, o.full_name, o.avatar_url,
         case when o.id = car.owner_id then 'owner'
              when exists (select 1 from public.promotions pr where pr.car_id = car.id and pr.promoter_id = o.id) then 'promoter'
              else 'buyer' end,
         c.promotion_id, c.contact_unlocked_at is not null, c.last_message_at, c.last_message_preview,
         (select count(*)::int from public.messages m where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.read_at is null),
         c.created_at
    from public.conversations c
    join public.cars car on car.id = c.car_id
    join public.profiles o on o.id = case when c.initiator_id = auth.uid() then c.recipient_id else c.initiator_id end
   where auth.uid() in (c.initiator_id, c.recipient_id)
   order by coalesce(c.last_message_at, c.created_at) desc;
$$;

-- -----------------------------------------------------------------------------
-- Promoter stats now also count referred conversations and visits
-- -----------------------------------------------------------------------------
create or replace function public.promotion_funnel()
returns table (promotion_id uuid, conversations bigint, visits bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         (select count(*) from public.conversations c where c.promotion_id = p.id),
         (select count(*) from public.visits v join public.conversations c on c.id = v.conversation_id
           where c.promotion_id = p.id and v.status in ('confirmed', 'completed'))
    from public.promotions p
   where p.promoter_id = auth.uid();
$$;

-- -----------------------------------------------------------------------------
-- Chat attachments (private bucket): "<conversation_id>/<file>"
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-attachments', 'chat-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create or replace function public.is_conversation_participant(p_conversation_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.conversations c
     where c.id::text = p_conversation_id and auth.uid() in (c.initiator_id, c.recipient_id)
  );
$$;

create policy "Participants read chat attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'chat-attachments' and public.is_conversation_participant((storage.foldername(name))[1]));

create policy "Participants upload chat attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-attachments' and public.is_conversation_participant((storage.foldername(name))[1]));

-- -----------------------------------------------------------------------------
-- Realtime
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.visits;

-- -----------------------------------------------------------------------------
-- Function permissions
-- -----------------------------------------------------------------------------
revoke execute on function public.mask_contact_info(text) from public, anon, authenticated;
revoke execute on function public.messages_before_insert() from public, anon, authenticated;
revoke execute on function public.messages_after_insert() from public, anon, authenticated;

do $$
declare f text;
begin
  foreach f in array array[
    'public.start_conversation(uuid, uuid, text)',
    'public.mark_conversation_read(uuid)',
    'public.unread_message_count()',
    'public.propose_visit(uuid, timestamptz, text)',
    'public.respond_visit(uuid, text)',
    'public.get_contact_details(uuid)',
    'public.my_conversations()',
    'public.promotion_funnel()',
    'public.is_conversation_participant(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end;
$$;
