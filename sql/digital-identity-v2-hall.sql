-- BallDoenSai.com Digital Identity V2: verified badges + historical Hall of Fame.
-- Apply after athlete-profile-v2.sql, ballsai-rating-v1.sql and digital-identity-v1.sql.
-- Safe to re-run in the Supabase SQL editor.

-- A profile itself is the first achievement. Keep the badge table and the
-- user-facing achievement record in sync, so the passport always reflects
-- verified system events rather than browser-provided claims.
alter table public.athlete_badges
  drop constraint if exists athlete_badges_badge_key_check;
alter table public.athlete_badges
  add constraint athlete_badges_badge_key_check
  check (badge_key in ('rookie', 'first_match', 'first_win', 'goal_hunter', 'playmaker', 'clean_sheet', 'match_mvp', 'road_warrior', 'rising_star'));

alter table public.athlete_achievements
  add column if not exists identity_badge_key text;
create unique index if not exists athlete_achievements_identity_badge_idx
  on public.athlete_achievements (athlete_id, identity_badge_key)
  where identity_badge_key is not null;

create or replace function public.sync_identity_badge_achievement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
begin
  v_title := case new.badge_key
    when 'rookie' then 'ROOKIE · เริ่มต้น Athlete Identity'
    when 'first_match' then 'FIRST KICK · นัดแรกในระบบ'
    when 'first_win' then 'WINNER · ชัยชนะครั้งแรก'
    when 'goal_hunter' then 'GOAL HUNTER · ประตูแรก'
    when 'playmaker' then 'PLAYMAKER · แอสซิสต์แรก'
    when 'clean_sheet' then 'THE WALL · คลีนชีตแรก'
    when 'match_mvp' then 'MATCH MVP · MVP นัดแรก'
    when 'road_warrior' then 'ROAD WARRIOR · ลงเล่นครบ 10 นัด'
    when 'rising_star' then 'RISING STAR · Power Rating ถึง 1,500'
  end;

  insert into public.athlete_achievements (
    athlete_id, title, event_name, achievement_year, verification_status, identity_badge_key
  ) values (
    new.athlete_id, v_title, 'BallDoenSai.com Digital Identity', extract(year from new.awarded_at)::smallint, 'verified', new.badge_key
  ) on conflict (athlete_id, identity_badge_key) where identity_badge_key is not null do nothing;

  return new;
end;
$$;

drop trigger if exists athlete_badge_sync_achievement on public.athlete_badges;
create trigger athlete_badge_sync_achievement
after insert on public.athlete_badges
for each row execute function public.sync_identity_badge_achievement();

create or replace function public.create_rookie_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.athlete_progress (athlete_id, xp_total, current_level)
  values (new.user_id, 50, 1)
  on conflict (athlete_id) do nothing;

  insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount)
  values (new.user_id, 'profile:' || new.user_id::text, 'achievement', 50)
  on conflict (athlete_id, event_key) do nothing;

  insert into public.athlete_badges (athlete_id, badge_key)
  values (new.user_id, 'rookie')
  on conflict (athlete_id, badge_key) do nothing;

  return new;
end;
$$;

drop trigger if exists athlete_profile_create_rookie_identity on public.athlete_profiles;
create trigger athlete_profile_create_rookie_identity
after insert on public.athlete_profiles
for each row execute function public.create_rookie_identity();

-- Historical awards are immutable snapshots, deliberately separate from
-- live Ranking. This lets a winner retain the honour after a new season.
create table if not exists public.hall_of_fame_entries (
  id uuid primary key default gen_random_uuid(),
  season text not null,
  category text not null check (category in ('champion', 'mvp', 'golden_boot', 'province_leader', 'rising_star', 'fair_play')),
  age_group text not null default 'OPEN' check (age_group in ('U12', 'U15', 'U18', 'OPEN')),
  province text,
  athlete_id uuid references public.athlete_profiles(user_id) on delete set null,
  player_rank_id uuid references public.player_ranks(id) on delete set null,
  athlete_name text not null check (char_length(athlete_name) between 1 and 120),
  team_name text,
  position text,
  image_url text,
  citation text not null check (char_length(citation) between 1 and 280),
  awarded_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  unique (season, category, age_group, province, athlete_id)
);

create index if not exists hall_of_fame_browse_idx
  on public.hall_of_fame_entries (season, category, age_group, province, awarded_at desc);
create index if not exists hall_of_fame_athlete_idx
  on public.hall_of_fame_entries (athlete_id, awarded_at desc);

alter table public.hall_of_fame_entries enable row level security;

drop policy if exists "hall_of_fame_public_select" on public.hall_of_fame_entries;
create policy "hall_of_fame_public_select"
on public.hall_of_fame_entries for select to anon, authenticated
using (true);

drop policy if exists "hall_of_fame_organizer_write" on public.hall_of_fame_entries;
create policy "hall_of_fame_organizer_write"
on public.hall_of_fame_entries for all to authenticated
using ((select public.is_organizer()))
with check ((select public.is_organizer()));

-- Backfill the system-generated badge records after this migration.
insert into public.athlete_achievements (
  athlete_id, title, event_name, achievement_year, verification_status, identity_badge_key
)
select
  b.athlete_id,
  case b.badge_key
    when 'rookie' then 'ROOKIE · เริ่มต้น Athlete Identity'
    when 'first_match' then 'FIRST KICK · นัดแรกในระบบ'
    when 'first_win' then 'WINNER · ชัยชนะครั้งแรก'
    when 'goal_hunter' then 'GOAL HUNTER · ประตูแรก'
    when 'playmaker' then 'PLAYMAKER · แอสซิสต์แรก'
    when 'clean_sheet' then 'THE WALL · คลีนชีตแรก'
    when 'match_mvp' then 'MATCH MVP · MVP นัดแรก'
    when 'road_warrior' then 'ROAD WARRIOR · ลงเล่นครบ 10 นัด'
    when 'rising_star' then 'RISING STAR · Power Rating ถึง 1,500'
  end,
  'BallDoenSai.com Digital Identity', extract(year from b.awarded_at)::smallint, 'verified', b.badge_key
from public.athlete_badges b
on conflict (athlete_id, identity_badge_key) where identity_badge_key is not null do nothing;
