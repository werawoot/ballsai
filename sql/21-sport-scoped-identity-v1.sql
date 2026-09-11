-- BallDoenSai.com Sport-scoped Identity V1
-- Apply after 19-athlete-sport-profiles-v1.sql and 20-guardian-verification-v2.sql.
-- This adds sport-specific XP and Badges. It deliberately does not alter or delete
-- legacy account-scoped identity tables until all readers have migrated.

begin;

create table if not exists public.athlete_sport_progress (
  athlete_id uuid not null,
  sport text not null,
  xp_total integer not null default 0 check (xp_total >= 0),
  current_level smallint not null default 1 check (current_level between 1 and 99),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (athlete_id, sport),
  foreign key (athlete_id, sport)
    references public.athlete_sport_profiles(athlete_id, sport) on delete cascade
);

create table if not exists public.athlete_sport_xp_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null,
  sport text not null,
  event_key text not null,
  event_type text not null check (event_type in ('achievement', 'match_played', 'match_win', 'goal', 'assist', 'clean_sheet', 'mvp')),
  xp_amount smallint not null check (xp_amount between 0 and 100),
  source_rating_event_id uuid references public.rating_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, sport, event_key),
  foreign key (athlete_id, sport)
    references public.athlete_sport_profiles(athlete_id, sport) on delete cascade
);

create table if not exists public.athlete_sport_badges (
  athlete_id uuid not null,
  sport text not null,
  badge_key text not null check (badge_key in ('rookie', 'first_match', 'first_win', 'goal_hunter', 'playmaker', 'clean_sheet', 'match_mvp', 'road_warrior', 'rising_star')),
  source_rating_event_id uuid references public.rating_events(id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (athlete_id, sport, badge_key),
  foreign key (athlete_id, sport)
    references public.athlete_sport_profiles(athlete_id, sport) on delete cascade
);

create index if not exists athlete_sport_xp_events_athlete_created_idx
  on public.athlete_sport_xp_events (athlete_id, sport, created_at desc);
create index if not exists athlete_sport_badges_athlete_awarded_idx
  on public.athlete_sport_badges (athlete_id, sport, awarded_at desc);

alter table public.athlete_sport_progress enable row level security;
alter table public.athlete_sport_xp_events enable row level security;
alter table public.athlete_sport_badges enable row level security;

drop policy if exists "sport_progress_public_or_owner_select" on public.athlete_sport_progress;
create policy "sport_progress_public_or_owner_select"
on public.athlete_sport_progress for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.athlete_sport_profiles profile
    where profile.athlete_id = athlete_sport_progress.athlete_id
      and profile.sport = athlete_sport_progress.sport
      and profile.is_public and profile.status = 'active'
  )
);

drop policy if exists "sport_xp_events_owner_or_admin_select" on public.athlete_sport_xp_events;
create policy "sport_xp_events_owner_or_admin_select"
on public.athlete_sport_xp_events for select to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "sport_badges_public_or_owner_select" on public.athlete_sport_badges;
create policy "sport_badges_public_or_owner_select"
on public.athlete_sport_badges for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1 from public.athlete_sport_profiles profile
    where profile.athlete_id = athlete_sport_badges.athlete_id
      and profile.sport = athlete_sport_badges.sport
      and profile.is_public and profile.status = 'active'
  )
);

revoke all on table public.athlete_sport_progress, public.athlete_sport_xp_events, public.athlete_sport_badges from anon, authenticated;
grant select on table public.athlete_sport_progress, public.athlete_sport_badges to anon, authenticated;
grant select on table public.athlete_sport_xp_events to authenticated;

create or replace function public.sync_athlete_sport_identity_from_rating_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid;
  v_sport text;
  v_matches integer;
  v_wins integer;
  v_goals integer;
  v_assists integer;
  v_clean_sheets integer;
  v_mvps integer;
  v_power_rating integer;
begin
  select rating.player_id, rating.sport, rating.matches_played, rating.wins,
         rating.goals, rating.assists, rating.clean_sheets, rating.mvps,
         rating.power_rating
  into v_athlete_id, v_sport, v_matches, v_wins, v_goals, v_assists,
       v_clean_sheets, v_mvps, v_power_rating
  from public.player_ratings rating
  where rating.id = new.player_rating_id;

  if v_athlete_id is null then return new; end if;
  if v_sport <> new.sport then
    raise exception 'RATING_EVENT_SPORT_MISMATCH' using errcode = '22023';
  end if;

  insert into public.athlete_sport_profiles (athlete_id, sport)
  values (v_athlete_id, v_sport)
  on conflict (athlete_id, sport) do nothing;
  insert into public.athlete_sport_progress (athlete_id, sport)
  values (v_athlete_id, v_sport)
  on conflict (athlete_id, sport) do nothing;

  insert into public.athlete_sport_xp_events (
    athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id
  ) values (v_athlete_id, v_sport, 'match:' || new.id::text, 'match_played', 30, new.id)
  on conflict (athlete_id, sport, event_key) do nothing;
  if new.result = 'win' then
    insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, v_sport, 'win:' || new.id::text, 'match_win', 20, new.id)
    on conflict (athlete_id, sport, event_key) do nothing;
  end if;
  if new.goals > 0 then
    insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, v_sport, 'goals:' || new.id::text, 'goal', least(100, new.goals * 10)::smallint, new.id)
    on conflict (athlete_id, sport, event_key) do nothing;
  end if;
  if new.assists > 0 then
    insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, v_sport, 'assists:' || new.id::text, 'assist', least(80, new.assists * 8)::smallint, new.id)
    on conflict (athlete_id, sport, event_key) do nothing;
  end if;
  if new.clean_sheet then
    insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, v_sport, 'clean-sheet:' || new.id::text, 'clean_sheet', 15, new.id)
    on conflict (athlete_id, sport, event_key) do nothing;
  end if;
  if new.mvp then
    insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, v_sport, 'mvp:' || new.id::text, 'mvp', 35, new.id)
    on conflict (athlete_id, sport, event_key) do nothing;
  end if;

  update public.athlete_sport_progress progress
  set xp_total = coalesce((
        select sum(event.xp_amount)
        from public.athlete_sport_xp_events event
        where event.athlete_id = v_athlete_id and event.sport = v_sport
      ), 0),
      current_level = least(99, 1 + floor(sqrt(coalesce((
        select sum(event.xp_amount)
        from public.athlete_sport_xp_events event
        where event.athlete_id = v_athlete_id and event.sport = v_sport
      ), 0) / 100.0))::smallint),
      updated_at = now()
  where progress.athlete_id = v_athlete_id and progress.sport = v_sport;

  insert into public.athlete_sport_badges (athlete_id, sport, badge_key, source_rating_event_id)
  select v_athlete_id, v_sport, badge_key, new.id
  from (values
    ('first_match', v_matches >= 1), ('first_win', v_wins >= 1), ('goal_hunter', v_goals >= 1),
    ('playmaker', v_assists >= 1), ('clean_sheet', v_clean_sheets >= 1), ('match_mvp', v_mvps >= 1),
    ('road_warrior', v_matches >= 10), ('rising_star', v_power_rating >= 1500)
  ) as badges(badge_key, is_earned)
  where is_earned
  on conflict (athlete_id, sport, badge_key) do nothing;

  return new;
end;
$$;

drop trigger if exists rating_event_sync_athlete_sport_identity on public.rating_events;
create trigger rating_event_sync_athlete_sport_identity
after insert on public.rating_events
for each row execute function public.sync_athlete_sport_identity_from_rating_event();

revoke all on function public.sync_athlete_sport_identity_from_rating_event() from public;

-- A first Sport Profile receives the existing rookie identity. Later profiles stay
-- STARTER at zero XP until their own confirmed match results arrive.
create or replace function public.create_sport_starter_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_count integer;
begin
  select count(*) into v_profile_count
  from public.athlete_sport_profiles
  where athlete_id = new.athlete_id;

  insert into public.athlete_sport_progress (athlete_id, sport)
  values (new.athlete_id, new.sport)
  on conflict (athlete_id, sport) do nothing;

  if v_profile_count = 1 then
    insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount)
    values (new.athlete_id, new.sport, 'profile:' || new.athlete_id::text || ':' || new.sport, 'achievement', 50)
    on conflict (athlete_id, sport, event_key) do nothing;
    insert into public.athlete_sport_badges (athlete_id, sport, badge_key)
    values (new.athlete_id, new.sport, 'rookie')
    on conflict (athlete_id, sport, badge_key) do nothing;
    update public.athlete_sport_progress
    set xp_total = 50, current_level = 1, updated_at = now()
    where athlete_id = new.athlete_id and sport = new.sport;
  end if;
  return new;
end;
$$;

revoke all on function public.create_sport_starter_identity() from public;

-- Backfill every sport represented by a ranking row before rebuilding its derived
-- identity data. An old player can have football data today and futsal data later;
-- the two stay separate from the first backfill onward.
insert into public.athlete_sport_profiles (athlete_id, sport)
select distinct rating.player_id, rating.sport
from public.player_ratings rating
where rating.player_id is not null
  and rating.sport in ('football', 'futsal', 'basketball')
on conflict (athlete_id, sport) do nothing;

insert into public.athlete_sport_progress (athlete_id, sport)
select profile.athlete_id, profile.sport
from public.athlete_sport_profiles profile
on conflict (athlete_id, sport) do nothing;

-- Existing rookie XP is assigned only to the original profile sport, never copied to
-- another sport. The original sport is the legacy athlete_profiles.sport value.
insert into public.athlete_sport_progress (athlete_id, sport, xp_total, current_level)
select profile.user_id, profile.sport, 50, 1
from public.athlete_profiles profile
where profile.sport in ('football', 'futsal', 'basketball')
on conflict (athlete_id, sport) do nothing;

insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount)
select profile.user_id, profile.sport, 'profile:' || profile.user_id::text || ':' || profile.sport, 'achievement', 50
from public.athlete_profiles profile
where profile.sport in ('football', 'futsal', 'basketball')
on conflict (athlete_id, sport, event_key) do nothing;

insert into public.athlete_sport_badges (athlete_id, sport, badge_key)
select profile.user_id, profile.sport, 'rookie'
from public.athlete_profiles profile
where profile.sport in ('football', 'futsal', 'basketball')
on conflict (athlete_id, sport, badge_key) do nothing;

-- Rebuild historical XP from the same organizer-confirmed rating events that power
-- the legacy identity chain. The unique event keys make this safe to re-run.
insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
select rating.player_id, event.sport, 'match:' || event.id::text, 'match_played', 30, event.id
from public.rating_events event
join public.player_ratings rating on rating.id = event.player_rating_id
where rating.player_id is not null
on conflict (athlete_id, sport, event_key) do nothing;

insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
select rating.player_id, event.sport, 'win:' || event.id::text, 'match_win', 20, event.id
from public.rating_events event
join public.player_ratings rating on rating.id = event.player_rating_id
where rating.player_id is not null and event.result = 'win'
on conflict (athlete_id, sport, event_key) do nothing;

insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
select rating.player_id, event.sport, 'goals:' || event.id::text, 'goal', least(100, event.goals * 10)::smallint, event.id
from public.rating_events event
join public.player_ratings rating on rating.id = event.player_rating_id
where rating.player_id is not null and event.goals > 0
on conflict (athlete_id, sport, event_key) do nothing;

insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
select rating.player_id, event.sport, 'assists:' || event.id::text, 'assist', least(80, event.assists * 8)::smallint, event.id
from public.rating_events event
join public.player_ratings rating on rating.id = event.player_rating_id
where rating.player_id is not null and event.assists > 0
on conflict (athlete_id, sport, event_key) do nothing;

insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
select rating.player_id, event.sport, 'clean-sheet:' || event.id::text, 'clean_sheet', 15, event.id
from public.rating_events event
join public.player_ratings rating on rating.id = event.player_rating_id
where rating.player_id is not null and event.clean_sheet
on conflict (athlete_id, sport, event_key) do nothing;

insert into public.athlete_sport_xp_events (athlete_id, sport, event_key, event_type, xp_amount, source_rating_event_id)
select rating.player_id, event.sport, 'mvp:' || event.id::text, 'mvp', 35, event.id
from public.rating_events event
join public.player_ratings rating on rating.id = event.player_rating_id
where rating.player_id is not null and event.mvp
on conflict (athlete_id, sport, event_key) do nothing;

update public.athlete_sport_progress progress
set xp_total = coalesce(total.xp_total, 0),
    current_level = least(99, 1 + floor(sqrt(coalesce(total.xp_total, 0) / 100.0))::smallint),
    updated_at = now()
from (
  select athlete_id, sport, sum(xp_amount)::integer as xp_total
  from public.athlete_sport_xp_events
  group by athlete_id, sport
) total
where progress.athlete_id = total.athlete_id and progress.sport = total.sport;

insert into public.athlete_sport_badges (athlete_id, sport, badge_key)
select rating.player_id, rating.sport, badges.badge_key
from public.player_ratings rating
cross join lateral (values
  ('first_match', rating.matches_played >= 1), ('first_win', rating.wins >= 1),
  ('goal_hunter', rating.goals >= 1), ('playmaker', rating.assists >= 1),
  ('clean_sheet', rating.clean_sheets >= 1), ('match_mvp', rating.mvps >= 1),
  ('road_warrior', rating.matches_played >= 10), ('rising_star', rating.power_rating >= 1500)
) as badges(badge_key, is_earned)
where rating.player_id is not null and badges.is_earned
on conflict (athlete_id, sport, badge_key) do nothing;

-- Activate the starter grant only after legacy rows are backfilled. This prevents a
-- historical rating in a second sport from accidentally receiving the legacy rookie
-- grant; legacy rookie XP belongs only to athlete_profiles.sport above.
drop trigger if exists athlete_sport_profile_create_starter_identity on public.athlete_sport_profiles;
create trigger athlete_sport_profile_create_starter_identity
after insert on public.athlete_sport_profiles
for each row execute function public.create_sport_starter_identity();

commit;
