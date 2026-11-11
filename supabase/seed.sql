-- =============================================================================
-- AutoPromo — seed data for testing (12 cars in Texas, 3 demo owners)
-- Run AFTER the migration. Safe to run once; re-running will fail on the
-- unique e-mails (delete the demo users in Auth first if you want to reseed).
--
-- Demo logins (password for all: AutoPromo#2026):
--   sarah.owner@demo.autopromo.test
--   mike.owner@demo.autopromo.test
--   linda.owner@demo.autopromo.test
-- Do NOT run this on your production project.
-- =============================================================================

do $$
declare
  owners uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  emails text[] := array[
    'sarah.owner@demo.autopromo.test',
    'mike.owner@demo.autopromo.test',
    'linda.owner@demo.autopromo.test'
  ];
  names text[] := array['Sarah Mitchell', 'Mike Thompson', 'Linda Garcia'];
  i int;
begin
  for i in 1..3 loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', owners[i], 'authenticated', 'authenticated', emails[i],
      extensions.crypt('AutoPromo#2026', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', names[i], 'accepted_terms', 'true'),
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), owners[i], owners[i]::text,
      jsonb_build_object('sub', owners[i]::text, 'email', emails[i], 'email_verified', true),
      'email', now(), now(), now()
    );

    -- profile row was created by trg_on_auth_user_created
    update public.profiles
       set is_owner = true, onboarded = true, active_mode = 'owner',
           identity_verified = true, state = 'TX'
     where id = owners[i];
  end loop;

  create temporary table seed_cars (
    n int, owner_idx int, make text, model text, year int, trim_level text, mileage int, color text,
    transmission public.transmission_type, fuel public.fuel_type, body public.body_type,
    price int, zip text, city text, lat double precision, lng double precision,
    ctype public.commission_type, cvalue numeric, vin text, descr text
  ) on commit drop;

  insert into seed_cars values
  (1, 1, 'Honda', 'Civic', 2019, 'EX', 48210, 'Sonic Gray', 'cvt', 'gasoline', 'sedan', 17900, '78701', 'Austin', 30.2711, -97.7437, 'fixed', 350, '2HGFC2F70KH512345',
   'One owner, garage kept. Clean title in hand. Regular oil changes at the dealer, new tires in March. Apple CarPlay, sunroof, Honda Sensing. Non-smoker.'),
  (2, 2, 'Ford', 'F-150', 2018, 'XLT SuperCrew', 89400, 'Oxford White', 'automatic', 'gasoline', 'truck', 26500, '77002', 'Houston', 29.7560, -95.3650, 'percent', 2, '1FTEW1EP4JFA23456',
   '5.0L V8, 4x4, tow package, bed liner. Used for weekend trips, never for work. Service records available. Small scratch on the tailgate.'),
  (3, 3, 'Toyota', 'Camry', 2020, 'SE', 35120, 'Celestial Silver', 'automatic', 'gasoline', 'sedan', 21400, '75201', 'Dallas', 32.7880, -96.7990, 'fixed', 400, '4T1G11AK5LU334567',
   'Very clean Camry SE, sport seats, adaptive cruise control, lane keep assist. Still under powertrain warranty. Clean Carfax.'),
  (4, 1, 'Tesla', 'Model 3', 2021, 'Long Range AWD', 28750, 'Pearl White', 'automatic', 'electric', 'sedan', 29900, '78664', 'Round Rock', 30.5083, -97.6789, 'fixed', 500, '5YJ3E1EB8MF445678',
   'Long Range AWD with ~320 miles of range. Premium interior, glass roof, all-weather mats included. Battery health 94%. Home charger can be included.'),
  (5, 2, 'Jeep', 'Wrangler', 2017, 'Unlimited Sport', 72300, 'Firecracker Red', 'manual', 'gasoline', 'suv', 24800, '77494', 'Katy', 29.7380, -95.8280, 'fixed', 450, '1C4BJWDG6HL556789',
   '4-door, 6-speed manual, hard top and soft top included. 33" tires, 2" lift, LED headlights. Fun weekend rig, very reliable.'),
  (6, 3, 'Chevrolet', 'Silverado 1500', 2019, 'LT Crew Cab', 64800, 'Black', 'automatic', 'gasoline', 'truck', 31200, '76102', 'Fort Worth', 32.7550, -97.3300, 'percent', 1.5, '3GCUYDED2KG667890',
   '5.3L V8, Z71 off-road package, heated seats, remote start, trailer brake controller. Highway miles. Clean title.'),
  (7, 1, 'Toyota', 'RAV4', 2022, 'XLE Hybrid', 19400, 'Blueprint', 'cvt', 'hybrid', 'suv', 32500, '78205', 'San Antonio', 29.4241, -98.4936, 'fixed', 450, 'JTMRWRFV1ND778901',
   'Hybrid AWD averaging 40 mpg. Blind spot monitor, power liftgate, wireless charging. Like new, always serviced at Toyota.'),
  (8, 2, 'Nissan', 'Altima', 2018, '2.5 SV', 67900, 'Gun Metallic', 'cvt', 'gasoline', 'sedan', 12900, '78401', 'Corpus Christi', 27.8006, -97.3964, 'fixed', 250, '1N4AL3AP0JC889012',
   'Reliable daily driver, great on gas. Remote start, heated seats, backup camera. Recently replaced brakes and battery.'),
  (9, 3, 'BMW', 'X5', 2019, 'xDrive40i', 51200, 'Carbon Black', 'automatic', 'gasoline', 'suv', 36900, '75024', 'Plano', 33.0750, -96.8080, 'fixed', 600, '5UXCR6C57KLL90123',
   'Premium package, panoramic roof, Harman Kardon sound, 3rd row seat. Certified pre-owned until last year. All services at BMW of Plano.'),
  (10, 1, 'Hyundai', 'Elantra', 2021, 'SEL', 26300, 'Intense Blue', 'automatic', 'gasoline', 'sedan', 16800, '79401', 'Lubbock', 33.5779, -101.8552, 'fixed', 250, '5NPLM4AG5MH901234',
   'Great first car. Remaining factory warranty (10yr/100k powertrain). Android Auto & CarPlay, lane keeping, very economical.'),
  (11, 2, 'Honda', 'Odyssey', 2018, 'EX-L', 78500, 'Modern Steel', 'automatic', 'gasoline', 'van', 22300, '75034', 'Frisco', 33.1500, -96.8230, 'percent', 2, '5FNRL6H78JB012345',
   'Family minivan, leather, rear entertainment screen, power sliding doors. Never in an accident. Seats 8 comfortably.'),
  (12, 3, 'Ford', 'Mustang', 2016, 'GT Premium', 41700, 'Race Red', 'manual', 'gasoline', 'coupe', 27900, '79901', 'El Paso', 31.7587, -106.4869, 'fixed', 500, '1FA6P8CF1G5123456',
   '5.0L Coyote V8, 6-speed manual, performance package, Recaro seats. Garage kept, never tracked. Stock exhaust (aftermarket included).');

  for i in 1..12 loop
    with s as (select * from seed_cars where n = i),
    ins as (
      insert into public.cars (
        owner_id, status, make, model, year, trim_level, mileage, exterior_color, transmission,
        fuel_type, body_type, price, description, zip, city, state, lat, lng,
        commission_type, commission_value, allow_any_verified_promoter, published_at, views
      )
      select owners[s.owner_idx], 'active', s.make, s.model, s.year, s.trim_level, s.mileage, s.color,
             s.transmission, s.fuel, s.body, s.price, s.descr, s.zip, s.city, 'TX', s.lat, s.lng,
             s.ctype, s.cvalue, (i % 2 = 0), now() - (i || ' days')::interval, (random() * 400)::int
        from s
      returning id
    )
    insert into public.car_private (car_id, vin)
    select ins.id, s.vin from ins, s;
  end loop;
end;
$$;
