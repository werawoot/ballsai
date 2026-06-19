-- BALLSAI Rating V1
-- Apply after the core BALLSAI tables exist.
-- The current app keeps player_ranks.pts as the visible Power Rating for compatibility.

begin;

create table if not exists public.sports (
  id text primary key,
  name text not null,
  created_at timestamptz not null default now()
);

insert into public.sports (id, name)
values
  ('football', 'Football'),
  ('futsal', 'Futsal'),
  ('basketball', 'Basketball'),
  ('volleyball', 'Volleyball'),
  ('badminton', 'Badminton')
on conflict (id) do nothing;

create table if not exists public.player_ratings (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references auth.users(id) on delete set null,
  player_rank_id uuid references public.player_ranks(id) on delete cascade,
  sport text not null references public.sports(id),
  season text not null default '2026',
  power_rating integer not null default 1000 check (power_rating between 0 and 3000),
  matches_played integer not null default 0 check (matches_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  draws integer not null default 0 check (draws >= 0),
  losses integer not null default 0 check (losses >= 0),
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  clean_sheets integer not null default 0 check (clean_sheets >= 0),
  mvps integer not null default 0 check (mvps >= 0),
  last_rating_change integer not null default 0,
  confidence text generated always as (
    case
      when matches_played < 3 then 'provisional'
      when matches_played < 10 then 'active'
      else 'full'
    end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (player_rank_id, sport, season)
);

create table if not exists public.rating_events (
  id uuid primary key default gen_random_uuid(),
  player_rating_id uuid not null references public.player_ratings(id) on delete cascade,
  sport text not null references public.sports(id),
  match_id uuid null,
  result text not null check (result in ('win', 'draw', 'loss')),
  opponent_rating integer not null default 1000 check (opponent_rating between 0 and 3000),
  rating_before integer not null check (rating_before between 0 and 3000),
  rating_after integer not null check (rating_after between 0 and 3000),
  rating_change integer not null,
  match_change integer not null,
  performance_bonus integer not null default 0,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  clean_sheet boolean not null default false,
  mvp boolean not null default false,
  save_percentage numeric(5,2) null check (save_percentage is null or (save_percentage >= 0 and save_percentage <= 100)),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_a_id uuid not null references public.teams(id) on delete cascade,
  team_b_id uuid not null references public.teams(id) on delete cascade,
  team_a_score integer not null check (team_a_score >= 0),
  team_b_score integer not null check (team_b_score >= 0),
  status text not null default 'confirmed' check (status in ('confirmed', 'void')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (team_a_id <> team_b_id)
);

create table if not exists public.match_player_performances (
  id uuid primary key default gen_random_uuid(),
  match_result_id uuid not null references public.match_results(id) on delete cascade,
  player_rank_id uuid not null references public.player_ranks(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  result text not null check (result in ('win', 'draw', 'loss')),
  rating_before integer not null check (rating_before between 0 and 3000),
  rating_after integer not null check (rating_after between 0 and 3000),
  rating_change integer not null,
  goals integer not null default 0 check (goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  clean_sheet boolean not null default false,
  mvp boolean not null default false,
  save_percentage numeric(5,2) null check (save_percentage is null or (save_percentage >= 0 and save_percentage <= 100)),
  created_at timestamptz not null default now()
);

alter table public.player_ratings enable row level security;
alter table public.rating_events enable row level security;
alter table public.match_results enable row level security;
alter table public.match_player_performances enable row level security;

drop policy if exists "player_ratings_select_public" on public.player_ratings;
create policy "player_ratings_select_public"
on public.player_ratings
for select
to anon, authenticated
using (true);

drop policy if exists "player_ratings_admin_write" on public.player_ratings;
create policy "player_ratings_admin_write"
on public.player_ratings
for all
to authenticated
using (public.is_organizer())
with check (public.is_organizer());

drop policy if exists "rating_events_select_public" on public.rating_events;
create policy "rating_events_select_public"
on public.rating_events
for select
to anon, authenticated
using (true);

drop policy if exists "rating_events_admin_write" on public.rating_events;
create policy "rating_events_admin_write"
on public.rating_events
for all
to authenticated
using (public.is_organizer())
with check (public.is_organizer());

drop policy if exists "match_results_select_public" on public.match_results;
create policy "match_results_select_public"
on public.match_results
for select
to anon, authenticated
using (true);

drop policy if exists "match_results_organizer_write" on public.match_results;
create policy "match_results_organizer_write"
on public.match_results
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = match_results.tournament_id
      and tr.organizer_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.tournaments tr
    where tr.id = match_results.tournament_id
      and tr.organizer_id = auth.uid()
  )
);

drop policy if exists "match_player_performances_select_public" on public.match_player_performances;
create policy "match_player_performances_select_public"
on public.match_player_performances
for select
to anon, authenticated
using (true);

drop policy if exists "match_player_performances_organizer_write" on public.match_player_performances;
create policy "match_player_performances_organizer_write"
on public.match_player_performances
for all
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.match_results mr
    join public.tournaments tr on tr.id = mr.tournament_id
    where mr.id = match_player_performances.match_result_id
      and tr.organizer_id = auth.uid()
  )
)
with check (
  public.is_admin()
  or exists (
    select 1
    from public.match_results mr
    join public.tournaments tr on tr.id = mr.tournament_id
    where mr.id = match_player_performances.match_result_id
      and tr.organizer_id = auth.uid()
  )
);

create index if not exists player_ratings_sport_season_rating_idx
  on public.player_ratings (sport, season, power_rating desc);

create index if not exists rating_events_player_rating_created_idx
  on public.rating_events (player_rating_id, created_at desc);

create index if not exists match_results_tournament_created_idx
  on public.match_results (tournament_id, created_at desc);

create index if not exists match_player_performances_match_idx
  on public.match_player_performances (match_result_id);

insert into public.player_ratings (
  player_id,
  player_rank_id,
  sport,
  season,
  power_rating,
  last_rating_change
)
select
  pr.player_id,
  pr.id,
  pr.sport,
  pr.season,
  greatest(0, least(3000, coalesce(pr.pts, 1000))),
  coalesce(pr.rank_change, 0)
from public.player_ranks pr
where not exists (
  select 1
  from public.player_ratings r
  where r.player_rank_id = pr.id
    and r.sport = pr.sport
    and r.season = pr.season
);

commit;
