-- BallDoenSai.com core schema baseline
--
-- Captured from the live project hivedzrwrrcnjrlirhtv on 2026-09-07 for new
-- environments only. Production already owns these tables: do not run this file there.
-- This file deliberately precedes the numbered RLS and domain migrations.

begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role text not null default 'player',
  created_at timestamp without time zone not null default now(),
  province text,
  team text,
  position text,
  birth_year integer,
  phone text,
  onboarding_persona text,
  onboarding_sport text,
  onboarding_goal text,
  onboarding_completed_at timestamptz,
  constraint profiles_onboarding_persona_check check (
    onboarding_persona is null or onboarding_persona in ('athlete', 'guardian', 'coach_organizer')
  ),
  constraint profiles_onboarding_goal_check check (
    onboarding_goal is null or onboarding_goal in ('player_card', 'find_competitions', 'follow_athlete', 'discover_talent')
  )
);

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  location text,
  start_date date,
  end_date date,
  fee numeric,
  promptpay text,
  organizer_id uuid references public.profiles(id),
  status text not null default 'open',
  created_at timestamp without time zone not null default now(),
  max_teams integer,
  age_category text,
  sport text
);

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  members text,
  tournament_id uuid references public.tournaments(id),
  created_by uuid references public.profiles(id),
  status text not null default 'draft',
  created_at timestamp without time zone not null default now(),
  constraint teams_status_check check (status in ('draft', 'pending', 'confirmed', 'rejected'))
);

create table if not exists public.player_ranks (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.profiles(id),
  sport text default 'football',
  player_name text not null,
  team text,
  province text,
  position text,
  ovr integer not null default 70,
  pts integer not null default 0,
  pac integer not null default 70,
  sho integer not null default 70,
  pas integer not null default 70,
  dri integer not null default 70,
  def integer not null default 70,
  rank_change integer not null default 0,
  season text default '2026',
  created_at timestamp without time zone not null default now(),
  age_category text,
  archived boolean not null default false
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references public.teams(id),
  tournament_id uuid references public.tournaments(id),
  user_id uuid references public.profiles(id),
  amount numeric,
  promptpay text,
  slip_url text,
  status text not null default 'pending',
  created_at timestamp without time zone not null default now()
);

commit;
