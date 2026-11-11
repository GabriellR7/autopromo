-- =============================================================================
-- AutoPromo — Phase 3 test data: a buyer conversation with a pending visit.
-- Run AFTER seed.sql and seed_phase2.sql. Do NOT run on production.
-- Mike (buyer) talks to the owner of the newest car, referred by Carlos.
-- =============================================================================
do $$
declare
  buyer uuid := (select id from auth.users where email = 'mike.owner@demo.autopromo.test');
  car public.cars;
  promo uuid;
  conv uuid;
begin
  select c.* into car from public.cars c
   where c.status = 'active' and c.owner_id <> buyer
     and exists (select 1 from public.promotions p where p.car_id = c.id and p.active)
   order by c.published_at desc limit 1;
  select id into promo from public.promotions where car_id = car.id and active limit 1;

  insert into public.conversations (car_id, initiator_id, recipient_id, promotion_id)
  values (car.id, buyer, car.owner_id, promo)
  returning id into conv;

  insert into public.messages (conversation_id, sender_id, body, created_at) values
    (conv, buyer, 'Hi! Is the ' || car.year || ' ' || car.make || ' ' || car.model || ' still available?', now() - interval '3 hours'),
    (conv, car.owner_id, 'Yes it is! Clean title in hand. Any questions?', now() - interval '2 hours 50 minutes'),
    (conv, buyer, 'Great. Can you text me at 512-555-0199 so we can talk?', now() - interval '2 hours 40 minutes'),
    (conv, buyer, 'Also, would you take ' || (car.price - 1000) || '?', now() - interval '2 hours 30 minutes');

  insert into public.profile_contacts (user_id, phone) values (buyer, '(512) 555-0199') on conflict (user_id) do nothing;
  insert into public.profile_contacts (user_id, phone) values (car.owner_id, '(512) 555-0100') on conflict (user_id) do nothing;

  insert into public.visits (conversation_id, car_id, buyer_id, owner_id, scheduled_at, note)
  values (conv, car.id, buyer, car.owner_id, date_trunc('hour', now()) + interval '2 days 10 hours', 'I''d like to bring my mechanic.');
end;
$$;
