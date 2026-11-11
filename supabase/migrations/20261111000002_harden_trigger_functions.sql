-- Trigger functions must not be callable via the API (triggers still fire normally).
-- Flagged by the Supabase security advisor.
revoke execute on function public.cars_enforce_rules() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.sync_vin_last6() from public, anon, authenticated;
