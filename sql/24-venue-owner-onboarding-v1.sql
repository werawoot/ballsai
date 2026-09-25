-- 24-venue-owner-onboarding-v1.sql
-- Allows the new Venue Owner onboarding path introduced with the venue booking flow.
-- Apply after 23-venues-and-bookings-v1.sql to project hivedzrwrrcnjrlirhtv only.

begin;

alter table public.profiles
  drop constraint if exists profiles_onboarding_persona_check;

alter table public.profiles
  add constraint profiles_onboarding_persona_check
  check (onboarding_persona is null or onboarding_persona = any (array[
    'athlete'::text, 'guardian'::text, 'coach_organizer'::text, 'venue_owner'::text
  ]));

alter table public.profiles
  drop constraint if exists profiles_onboarding_goal_check;

alter table public.profiles
  add constraint profiles_onboarding_goal_check
  check (onboarding_goal is null or onboarding_goal = any (array[
    'player_card'::text, 'find_competitions'::text, 'follow_athlete'::text,
    'discover_talent'::text, 'manage_venue'::text
  ]));

commit;
