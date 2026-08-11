-- BallDoenSai.com first-visit onboarding.
-- Safe to run on the existing production project.

alter table public.profiles
  add column if not exists onboarding_persona text
    check (onboarding_persona in ('athlete', 'guardian', 'coach_organizer')),
  add column if not exists onboarding_sport text,
  add column if not exists onboarding_goal text
    check (onboarding_goal in ('player_card', 'find_competitions', 'follow_athlete', 'discover_talent')),
  add column if not exists onboarding_completed_at timestamptz;

create index if not exists profiles_onboarding_persona_idx
  on public.profiles (onboarding_persona)
  where onboarding_completed_at is not null;
