-- Supabase default privileges can grant anon EXECUTE independently of PUBLIC.
-- Apply after 22-mobile-onboarding-v1.sql.
begin;
revoke all on function public.complete_mobile_onboarding(text, text, text, text, text, text, date, boolean) from anon;
grant execute on function public.complete_mobile_onboarding(text, text, text, text, text, text, date, boolean) to authenticated;
commit;
