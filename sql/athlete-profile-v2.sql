-- BALLSAI Athlete Profile V2
-- Apply after sql/supabase-rls.sql and sql/ballsai-rating-v1.sql.

begin;

create table if not exists public.athlete_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  birth_date date,
  sport text not null default 'football',
  position text,
  province text,
  height_cm smallint check (height_cm between 80 and 250),
  weight_kg numeric(5,2) check (weight_kg between 20 and 250),
  current_team text,
  bio text check (char_length(bio) <= 600),
  profile_image_url text,
  guardian_consent_at timestamptz,
  is_public boolean not null default false,
  verification_level text not null default 'self'
    check (verification_level in ('self', 'coach_verified', 'performance_verified')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_videos (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  video_url text not null,
  video_type text not null default 'highlight'
    check (video_type in ('highlight', 'match', 'training')),
  created_at timestamptz not null default now()
);

create table if not exists public.athlete_achievements (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  event_name text,
  achievement_year smallint check (achievement_year between 1990 and 2100),
  proof_url text,
  verification_status text not null default 'unverified'
    check (verification_status in ('unverified', 'pending', 'verified', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.athlete_skill_assessments (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  season text not null default extract(year from current_date)::text,
  speed smallint check (speed between 0 and 99),
  stamina smallint check (stamina between 0 and 99),
  strength smallint check (strength between 0 and 99),
  technique smallint check (technique between 0 and 99),
  vision smallint check (vision between 0 and 99),
  source_level text not null default 'self'
    check (source_level in ('self', 'coach_verified', 'performance_verified')),
  assessor_id uuid references auth.users(id) on delete set null,
  evidence_url text,
  created_at timestamptz not null default now()
);

create index if not exists athlete_profiles_discovery_idx
  on public.athlete_profiles (sport, province, position)
  where is_public = true;
create index if not exists athlete_videos_athlete_id_idx
  on public.athlete_videos (athlete_id, created_at desc);
create index if not exists athlete_achievements_athlete_id_idx
  on public.athlete_achievements (athlete_id, created_at desc);
create index if not exists athlete_skill_assessments_athlete_id_idx
  on public.athlete_skill_assessments (athlete_id, created_at desc);

create or replace function public.set_athlete_profile_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if old.verification_level is distinct from new.verification_level
     or old.verified_at is distinct from new.verified_at then
    if (select auth.uid()) = old.user_id and not (select public.is_admin()) then
      raise exception 'Only an admin can change athlete verification';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_profiles_set_updated_at on public.athlete_profiles;
create trigger athlete_profiles_set_updated_at
before update on public.athlete_profiles
for each row execute function public.set_athlete_profile_updated_at();

alter table public.athlete_profiles enable row level security;
alter table public.athlete_videos enable row level security;
alter table public.athlete_achievements enable row level security;
alter table public.athlete_skill_assessments enable row level security;

-- Public athlete photos. Each authenticated user can only write inside
-- athlete-avatars/<auth.uid()>/.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'athlete-avatars',
  'athlete-avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "athlete_avatars_public_read" on storage.objects;
create policy "athlete_avatars_public_read"
on storage.objects for select to anon, authenticated
using (bucket_id = 'athlete-avatars');

drop policy if exists "athlete_avatars_owner_insert" on storage.objects;
create policy "athlete_avatars_owner_insert"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'athlete-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "athlete_avatars_owner_update" on storage.objects;
create policy "athlete_avatars_owner_update"
on storage.objects for update to authenticated
using (
  bucket_id = 'athlete-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'athlete-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "athlete_avatars_owner_delete" on storage.objects;
create policy "athlete_avatars_owner_delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'athlete-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "athlete_profiles_public_or_owner_select" on public.athlete_profiles;
create policy "athlete_profiles_public_or_owner_select"
on public.athlete_profiles for select to anon, authenticated
using (
  is_public = true
  or user_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists "athlete_profiles_owner_insert" on public.athlete_profiles;
create policy "athlete_profiles_owner_insert"
on public.athlete_profiles for insert to authenticated
with check (
  user_id = (select auth.uid())
  and verification_level = 'self'
  and verified_at is null
);

drop policy if exists "athlete_profiles_owner_update" on public.athlete_profiles;
create policy "athlete_profiles_owner_update"
on public.athlete_profiles for update to authenticated
using (user_id = (select auth.uid()) or (select public.is_admin()))
with check (
  user_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists "athlete_videos_public_or_owner_select" on public.athlete_videos;
create policy "athlete_videos_public_or_owner_select"
on public.athlete_videos for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.athlete_profiles ap
    where ap.user_id = athlete_videos.athlete_id and ap.is_public = true
  )
);

drop policy if exists "athlete_videos_owner_write" on public.athlete_videos;
create policy "athlete_videos_owner_write"
on public.athlete_videos for all to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()))
with check (athlete_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "athlete_achievements_public_or_owner_select" on public.athlete_achievements;
create policy "athlete_achievements_public_or_owner_select"
on public.athlete_achievements for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.athlete_profiles ap
    where ap.user_id = athlete_achievements.athlete_id and ap.is_public = true
  )
);

drop policy if exists "athlete_achievements_owner_write" on public.athlete_achievements;
create policy "athlete_achievements_owner_write"
on public.athlete_achievements for all to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()))
with check (
  (athlete_id = (select auth.uid()) and verification_status in ('unverified', 'pending'))
  or (select public.is_admin())
);

drop policy if exists "athlete_skills_public_or_owner_select" on public.athlete_skill_assessments;
create policy "athlete_skills_public_or_owner_select"
on public.athlete_skill_assessments for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.athlete_profiles ap
    where ap.user_id = athlete_skill_assessments.athlete_id and ap.is_public = true
  )
);

drop policy if exists "athlete_skills_self_insert" on public.athlete_skill_assessments;
create policy "athlete_skills_self_insert"
on public.athlete_skill_assessments for insert to authenticated
with check (
  athlete_id = (select auth.uid())
  and assessor_id = (select auth.uid())
  and source_level = 'self'
);

-- Keep one ranking row per athlete, sport and season when linked to an account.
create unique index if not exists player_ranks_player_sport_season_idx
  on public.player_ranks (player_id, sport, season)
  where player_id is not null;

commit;
