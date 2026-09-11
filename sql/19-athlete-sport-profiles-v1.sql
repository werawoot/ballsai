-- BallDoenSai.com Athlete Sport Profiles V1
-- Additive migration. Apply after athlete-profile-v2.sql and before the
-- guardian-consent and sport-identity migrations. Never edit applied SQL files.
--
-- One Athlete Identity may own several Sport Profiles. This migration preserves the
-- existing athlete_profiles row as person-level compatibility data while new reads
-- gradually move to athlete_sport_profiles.

begin;

create table if not exists public.athlete_sport_profiles (
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  sport text not null check (sport in ('football', 'futsal', 'basketball')),
  position text,
  current_team text,
  province text,
  is_public boolean not null default false,
  status text not null default 'active' check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, sport)
);

create index if not exists athlete_sport_profiles_public_discovery_idx
  on public.athlete_sport_profiles (sport, province, position, updated_at desc)
  where is_public and status = 'active';
create index if not exists athlete_sport_profiles_athlete_status_idx
  on public.athlete_sport_profiles (athlete_id, status);

create or replace function public.set_athlete_sport_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists athlete_sport_profiles_set_updated_at on public.athlete_sport_profiles;
create trigger athlete_sport_profiles_set_updated_at
before update on public.athlete_sport_profiles
for each row execute function public.set_athlete_sport_profile_updated_at();

-- Until V2 consent verification is applied, preserve the existing public-profile
-- threshold for the compatibility backfill. Migration 20 replaces this trigger with
-- one that requires an active, auditable guardian consent.
create or replace function public.enforce_legacy_guardian_consent_for_sport_profile()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_birth_date date;
  v_guardian_consent_at timestamptz;
begin
  if not new.is_public then return new; end if;

  select birth_date, guardian_consent_at
  into v_birth_date, v_guardian_consent_at
  from public.athlete_profiles
  where user_id = new.athlete_id;

  if v_birth_date is null then
    raise exception 'PUBLIC_REQUIRES_BIRTH_DATE' using errcode = '22023';
  end if;
  if date_part('year', age(current_date, v_birth_date)) < 20
     and v_guardian_consent_at is null then
    raise exception 'PUBLIC_REQUIRES_GUARDIAN_CONSENT' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_sport_profiles_publication_guard on public.athlete_sport_profiles;
create trigger athlete_sport_profiles_publication_guard
before insert or update of is_public on public.athlete_sport_profiles
for each row execute function public.enforce_legacy_guardian_consent_for_sport_profile();

alter table public.athlete_sport_profiles enable row level security;

drop policy if exists "athlete_sport_profiles_public_or_owner_select" on public.athlete_sport_profiles;
create policy "athlete_sport_profiles_public_or_owner_select"
on public.athlete_sport_profiles for select to anon, authenticated
using (
  (is_public and status = 'active')
  or athlete_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists "athlete_sport_profiles_owner_insert" on public.athlete_sport_profiles;
create policy "athlete_sport_profiles_owner_insert"
on public.athlete_sport_profiles for insert to authenticated
with check (athlete_id = (select auth.uid()) and status = 'active');

drop policy if exists "athlete_sport_profiles_owner_or_admin_update" on public.athlete_sport_profiles;
create policy "athlete_sport_profiles_owner_or_admin_update"
on public.athlete_sport_profiles for update to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()))
with check (athlete_id = (select auth.uid()) or (select public.is_admin()));

revoke all on table public.athlete_sport_profiles from anon;
grant select on table public.athlete_sport_profiles to anon, authenticated;
grant insert, update on table public.athlete_sport_profiles to authenticated;

-- Backfill only known sport slugs. Unknown historical values are intentionally left
-- untouched and must be reviewed before adding another controlled sport slug.
insert into public.athlete_sport_profiles (
  athlete_id, sport, position, current_team, province, is_public
)
select
  profile.user_id,
  profile.sport,
  profile.position,
  profile.current_team,
  profile.province,
  profile.is_public
from public.athlete_profiles profile
where profile.sport in ('football', 'futsal', 'basketball')
on conflict (athlete_id, sport) do nothing;

commit;
