-- =============================================================================
-- AutoPromo — Phase 2 test data: a demo promoter with promotions and clicks.
-- Run AFTER seed.sql. Login: carlos.promoter@demo.autopromo.test / AutoPromo#2026
-- Do NOT run on production.
-- =============================================================================
do $$
declare
  promoter uuid := gen_random_uuid();
  car record;
  promo_id uuid;
  n int := 0;
  k int;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) values (
    '00000000-0000-0000-0000-000000000000', promoter, 'authenticated', 'authenticated',
    'carlos.promoter@demo.autopromo.test', extensions.crypt('AutoPromo#2026', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Carlos Rivera', 'accepted_terms', 'true'),
    now(), now(), '', '', '', ''
  );
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), promoter, promoter::text,
          jsonb_build_object('sub', promoter::text, 'email', 'carlos.promoter@demo.autopromo.test', 'email_verified', true),
          'email', now(), now(), now());

  update public.profiles
     set is_promoter = true, onboarded = true, active_mode = 'promoter', identity_verified = true,
         promoter_agreement_at = now(), state = 'TX', promoter_level = 'silver'
   where id = promoter;

  -- Approved promotions on the 4 most recent cars, with some clicks
  for car in select id from public.cars where status = 'active' order by published_at desc limit 4 loop
    n := n + 1;
    insert into public.promotion_requests (car_id, promoter_id, status, message, decided_at)
    values (car.id, promoter, 'approved', 'I share cars in 3 local Facebook groups (40k+ members).', now() - (n || ' days')::interval);
    promo_id := (public.activate_promotion(car.id, promoter)).id;
    for k in 1..(5 + n * 7) loop
      insert into public.referral_clicks (promotion_id, car_id, visitor_id, referrer, created_at)
      values (promo_id, car.id, 'demo-visitor-' || (k % (3 + n * 4)), 'https://facebook.com',
              now() - ((k * 11) || ' hours')::interval);
    end loop;
  end loop;

  -- Two pending requests waiting for the owners
  for car in select id from public.cars where status = 'active' order by published_at desc offset 4 limit 2 loop
    insert into public.promotion_requests (car_id, promoter_id, status, message)
    values (car.id, promoter, 'pending', 'Hi! I can help you sell this one — I have buyers asking for this model.');
  end loop;
end;
$$;
