-- BallDoenSai.com Digital Identity V1
-- Apply after sql/athlete-profile-v2.sql and sql/ballsai-rating-v1.sql.
-- XP is awarded only from verified match records, never from browser input.

create table if not exists public.athlete_progress (
  athlete_id uuid primary key references public.athlete_profiles(user_id) on delete cascade,
  xp_total integer not null default 0 check (xp_total >= 0),
  current_level smallint not null default 1 check (current_level between 1 and 99),
  updated_at timestamptz not null default now()
);

create table if not exists public.athlete_xp_events (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  event_key text not null,
  event_type text not null check (event_type in ('match_played', 'match_win', 'goal', 'assist', 'clean_sheet', 'mvp', 'achievement')),
  xp_amount smallint not null check (xp_amount > 0 and xp_amount <= 500),
  source_rating_event_id uuid references public.rating_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (athlete_id, event_key)
);

create table if not exists public.athlete_badges (
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  badge_key text not null check (badge_key in ('first_match', 'first_win', 'goal_hunter', 'playmaker', 'clean_sheet', 'match_mvp', 'road_warrior', 'rising_star')),
  source_rating_event_id uuid references public.rating_events(id) on delete set null,
  awarded_at timestamptz not null default now(),
  primary key (athlete_id, badge_key)
);

create index if not exists athlete_xp_events_athlete_created_idx
  on public.athlete_xp_events (athlete_id, created_at desc);
create index if not exists athlete_badges_athlete_awarded_idx
  on public.athlete_badges (athlete_id, awarded_at desc);

alter table public.athlete_progress enable row level security;
alter table public.athlete_xp_events enable row level security;
alter table public.athlete_badges enable row level security;

drop policy if exists "identity_progress_public_or_owner_select" on public.athlete_progress;
create policy "identity_progress_public_or_owner_select"
on public.athlete_progress for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (select 1 from public.athlete_profiles p where p.user_id = athlete_progress.athlete_id and p.is_public)
);

drop policy if exists "identity_xp_owner_or_admin_select" on public.athlete_xp_events;
create policy "identity_xp_owner_or_admin_select"
on public.athlete_xp_events for select to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "identity_badges_public_or_owner_select" on public.athlete_badges;
create policy "identity_badges_public_or_owner_select"
on public.athlete_badges for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or exists (select 1 from public.athlete_profiles p where p.user_id = athlete_badges.athlete_id and p.is_public)
);

create or replace function public.sync_athlete_identity_from_rating_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid;
  v_matches integer;
  v_wins integer;
  v_goals integer;
  v_assists integer;
  v_clean_sheets integer;
  v_mvps integer;
  v_power_rating integer;
  v_xp integer;
begin
  select player_id, matches_played, wins, goals, assists, clean_sheets, mvps, power_rating
  into v_athlete_id, v_matches, v_wins, v_goals, v_assists, v_clean_sheets, v_mvps, v_power_rating
  from public.player_ratings
  where id = new.player_rating_id;

  if v_athlete_id is null then return new; end if;

  insert into public.athlete_progress (athlete_id) values (v_athlete_id)
  on conflict (athlete_id) do nothing;

  insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
  values (v_athlete_id, 'match:' || new.id::text, 'match_played', 30, new.id)
  on conflict (athlete_id, event_key) do nothing;
  if new.result = 'win' then
    insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, 'win:' || new.id::text, 'match_win', 20, new.id)
    on conflict (athlete_id, event_key) do nothing;
  end if;
  if new.goals > 0 then
    insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, 'goals:' || new.id::text, 'goal', least(100, new.goals * 10), new.id)
    on conflict (athlete_id, event_key) do nothing;
  end if;
  if new.assists > 0 then
    insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, 'assists:' || new.id::text, 'assist', least(80, new.assists * 8), new.id)
    on conflict (athlete_id, event_key) do nothing;
  end if;
  if new.clean_sheet then
    insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, 'clean-sheet:' || new.id::text, 'clean_sheet', 15, new.id)
    on conflict (athlete_id, event_key) do nothing;
  end if;
  if new.mvp then
    insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
    values (v_athlete_id, 'mvp:' || new.id::text, 'mvp', 35, new.id)
    on conflict (athlete_id, event_key) do nothing;
  end if;

  update public.athlete_progress
  set xp_total = coalesce((select sum(xp_amount) from public.athlete_xp_events where athlete_id = v_athlete_id), 0),
      current_level = least(99, 1 + floor(sqrt(coalesce((select sum(xp_amount) from public.athlete_xp_events where athlete_id = v_athlete_id), 0) / 100.0))::smallint),
      updated_at = now()
  where athlete_id = v_athlete_id;

  insert into public.athlete_badges (athlete_id, badge_key, source_rating_event_id)
  select v_athlete_id, badge_key, new.id
  from (values
    ('first_match', v_matches >= 1), ('first_win', v_wins >= 1), ('goal_hunter', v_goals >= 1),
    ('playmaker', v_assists >= 1), ('clean_sheet', v_clean_sheets >= 1), ('match_mvp', v_mvps >= 1),
    ('road_warrior', v_matches >= 10), ('rising_star', v_power_rating >= 1500)
  ) as badges(badge_key, is_earned)
  where is_earned
  on conflict (athlete_id, badge_key) do nothing;

  return new;
end;
$$;

drop trigger if exists rating_event_sync_athlete_identity on public.rating_events;
create trigger rating_event_sync_athlete_identity
after insert on public.rating_events
for each row execute function public.sync_athlete_identity_from_rating_event();

revoke all on function public.sync_athlete_identity_from_rating_event() from public;

-- Backfill existing verified results once. The unique event key makes this safe to re-run.
insert into public.athlete_progress (athlete_id)
select distinct r.player_id
from public.player_ratings r
join public.athlete_profiles p on p.user_id = r.player_id
where r.player_id is not null
on conflict (athlete_id) do nothing;

insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
select r.player_id, 'match:' || e.id::text, 'match_played', 30, e.id
from public.rating_events e join public.player_ratings r on r.id = e.player_rating_id
where r.player_id is not null
on conflict (athlete_id, event_key) do nothing;

insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
select r.player_id, 'win:' || e.id::text, 'match_win', 20, e.id
from public.rating_events e join public.player_ratings r on r.id = e.player_rating_id
where r.player_id is not null and e.result = 'win'
on conflict (athlete_id, event_key) do nothing;

insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
select r.player_id, 'goals:' || e.id::text, 'goal', least(100, e.goals * 10)::smallint, e.id
from public.rating_events e join public.player_ratings r on r.id = e.player_rating_id
where r.player_id is not null and e.goals > 0
on conflict (athlete_id, event_key) do nothing;

insert into public.athlete_xp_events (athlete_id, event_key, event_type, xp_amount, source_rating_event_id)
select r.player_id, 'assists:' || e.id::text, 'assist', least(80, e.assists * 8)::smallint, e.id
from public.rating_events e join public.player_ratings r on r.id = e.player_rating_id
where r.player_id is not null and e.assists > 0
on conflict (athlete_id, event_key) do nothing;

update public.athlete_progress progress
set xp_total = coalesce(t.xp_total, 0),
    current_level = least(99, 1 + floor(sqrt(coalesce(t.xp_total, 0) / 100.0))::smallint),
    updated_at = now()
from (
  select athlete_id, sum(xp_amount)::integer as xp_total
  from public.athlete_xp_events
  group by athlete_id
) t
where progress.athlete_id = t.athlete_id;

insert into public.athlete_badges (athlete_id, badge_key)
select r.player_id, badges.badge_key
from public.player_ratings r
join public.athlete_profiles p on p.user_id = r.player_id
cross join lateral (values
  ('first_match', r.matches_played >= 1), ('first_win', r.wins >= 1), ('goal_hunter', r.goals >= 1),
  ('playmaker', r.assists >= 1), ('clean_sheet', r.clean_sheets >= 1), ('match_mvp', r.mvps >= 1),
  ('road_warrior', r.matches_played >= 10), ('rising_star', r.power_rating >= 1500)
) as badges(badge_key, is_earned)
where r.player_id is not null and badges.is_earned
on conflict (athlete_id, badge_key) do nothing;
