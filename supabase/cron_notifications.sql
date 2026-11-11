-- =============================================================================
-- Schedule the "notifications" Edge Function every 10 minutes.
-- Run this ONCE in the SQL Editor AFTER setting the Edge Function secrets
-- (RESEND_API_KEY, EMAIL_FROM, SITE_URL, CRON_SECRET).
-- Replace PUT-THE-SAME-CRON-SECRET-HERE with the CRON_SECRET value.
-- =============================================================================
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'autopromo-notifications',
  '*/10 * * * *',
  $$
  select net.http_post(
    url     := 'https://scvdvwryiuthnzwsyade.supabase.co/functions/v1/notifications',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PUT-THE-SAME-CRON-SECRET-HERE'),
    body    := '{}'::jsonb
  );
  $$
);

-- To stop it later:
-- select cron.unschedule('autopromo-notifications');
