-- 22-guardian-consent-trigger-v1.sql
-- Restores the database trigger that invokes the guardian-link consent rule.
--
-- Apply only after 21-guardian-links-v1.sql. Migration 21 replaces the trigger
-- function so consent is derived from an accepted guardian_links row; this migration
-- ensures that function is actually invoked for profile inserts and updates.

begin;

drop trigger if exists athlete_profiles_guardian_consent_guard on public.athlete_profiles;

create trigger athlete_profiles_guardian_consent_guard
before insert or update of is_public, birth_date on public.athlete_profiles
for each row execute function public.enforce_guardian_consent_for_public_profile();

commit;
