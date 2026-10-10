-- 74-match-minutes-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on ballsai-rating-v1 (match_results), SQL18/20 (team_members), SQL21
-- (is_accepted_guardian_for) and athlete_profiles. Run as postgres.
-- Precheck: sql/74-match-minutes-precheck.sql.
--
-- Why: coach tools round 6. After a confirmed match, the coach of a team that played in
-- it records who started, who came on or went off at which minute, and so how many
-- minutes each member played. AGENTS.md rule 8: this is the coach's record, not a
-- verified performance; the screens label it "recorded by the coach", and it never
-- changes a rating, XP or a public card.
--
--   * team_match_minutes: one row per match and team (the match length, 20-120 minutes,
--     who saved it and when).
--   * team_match_minute_entries: one row per athlete who played: started, the minute they
--     came on (null when they started), the minute they went off (null when they played
--     to the end); minutes is computed from these, never typed.
--   * save_match_minutes(match, team, length, entries): the team's creator, for a
--     confirmed match their team played; every athlete an accepted member; replaces the
--     match's sheet in one transaction, so a retry or a correction never adds rows.
--   * Read by the team's creator, the athlete and their accepted guardian. Never public.
--   * my_match_minutes(): this caller's and their children's season totals per team.
-- PDPA: minutes only, no notes. Deleting the athlete profile deletes their rows; deleting
-- the match or the team deletes the sheet.

begin;

do $$
begin
  if to_regclass('public.match_results') is null
     or to_regclass('public.team_members') is null
     or to_regclass('public.athlete_profiles') is null
     or to_regprocedure('public.is_accepted_guardian_for(uuid)') is null then
    raise exception 'Prerequisites missing: match_results, SQL18/20 team_members, SQL21 guardian links, athlete_profiles';
  end if;
end;
$$;

create table if not exists public.team_match_minutes (
  match_result_id uuid not null references public.match_results(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  match_length smallint not null check (match_length between 20 and 120),
  recorded_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (match_result_id, team_id)
);
create index if not exists team_match_minutes_team_idx on public.team_match_minutes (team_id);

create table if not exists public.team_match_minute_entries (
  match_result_id uuid not null,
  team_id uuid not null,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  started boolean not null,
  on_minute smallint check (on_minute between 0 and 120),
  off_minute smallint check (off_minute between 0 and 120),
  minutes smallint not null check (minutes between 0 and 120),
  primary key (match_result_id, team_id, athlete_id),
  foreign key (match_result_id, team_id) references public.team_match_minutes(match_result_id, team_id) on delete cascade,
  check (started = (on_minute is null)),
  check (off_minute is null or on_minute is null or off_minute > on_minute)
);
create index if not exists team_match_minute_entries_athlete_idx on public.team_match_minute_entries (athlete_id);

alter table public.team_match_minutes enable row level security;
alter table public.team_match_minute_entries enable row level security;
revoke all on table public.team_match_minutes, public.team_match_minute_entries from public, anon, authenticated;
grant select on table public.team_match_minutes, public.team_match_minute_entries to authenticated;

create or replace function public.is_team_owner(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = (select auth.uid()));
$$;

drop policy if exists team_match_minutes_select_owner on public.team_match_minutes;
create policy team_match_minutes_select_owner on public.team_match_minutes for select to authenticated
using ((select public.is_team_owner(team_id)) or (select public.is_admin()));

drop policy if exists team_match_minute_entries_select_parties on public.team_match_minute_entries;
create policy team_match_minute_entries_select_parties on public.team_match_minute_entries for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or (select public.is_team_owner(team_id))
  or (select public.is_admin())
);

create or replace function public.save_match_minutes(p_match_id uuid, p_team_id uuid, p_length integer, p_entries jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_entry jsonb;
  v_athlete uuid;
  v_started boolean;
  v_on integer;
  v_off integer;
  v_seen uuid[] := '{}';
  v_count integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_length is null or p_length not between 20 and 120
     or p_entries is null or jsonb_typeof(p_entries) <> 'array' or jsonb_array_length(p_entries) > 40 then
    raise exception 'INVALID_MINUTES' using errcode = '22023';
  end if;
  -- The creator of a team that played in this confirmed match. The team row is locked so
  -- concurrent saves of one sheet queue and the last one wins whole.
  perform 1 from public.teams t where t.id = p_team_id and t.created_by = v_user for update;
  if not found or not exists (
    select 1 from public.match_results m
    where m.id = p_match_id and m.status = 'confirmed' and p_team_id in (m.team_a_id, m.team_b_id)
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;

  -- Check every entry before writing anything.
  for v_entry in select value from jsonb_array_elements(p_entries) loop
    if jsonb_typeof(v_entry) <> 'object' or jsonb_typeof(v_entry -> 'athleteId') <> 'string'
       or jsonb_typeof(v_entry -> 'started') <> 'boolean'
       or (v_entry ? 'on' and jsonb_typeof(v_entry -> 'on') not in ('number', 'null'))
       or (v_entry ? 'off' and jsonb_typeof(v_entry -> 'off') not in ('number', 'null'))
       or (v_entry ->> 'athleteId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'INVALID_MINUTES' using errcode = '22023';
    end if;
    v_athlete := (v_entry ->> 'athleteId')::uuid;
    v_started := (v_entry ->> 'started')::boolean;
    if (v_entry ->> 'on') is not null and (v_entry ->> 'on')::numeric <> floor((v_entry ->> 'on')::numeric) then
      raise exception 'INVALID_MINUTES' using errcode = '22023';
    end if;
    if (v_entry ->> 'off') is not null and (v_entry ->> 'off')::numeric <> floor((v_entry ->> 'off')::numeric) then
      raise exception 'INVALID_MINUTES' using errcode = '22023';
    end if;
    v_on := (v_entry ->> 'on')::numeric;
    v_off := (v_entry ->> 'off')::numeric;
    if v_athlete = any(v_seen)
       or (v_started and v_on is not null) or (not v_started and v_on is null)
       or (v_on is not null and v_on not between 0 and p_length - 1)
       or (v_off is not null and (v_off not between 1 and p_length or v_off <= coalesce(v_on, 0))) then
      raise exception 'INVALID_MINUTES' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.team_members tm
      join public.athlete_profiles ap on ap.user_id = tm.athlete_id
      where tm.team_id = p_team_id and tm.athlete_id = v_athlete and tm.status = 'accepted'
    ) then
      raise exception 'NOT_ON_TEAM' using errcode = '22023';
    end if;
    v_seen := v_seen || v_athlete;
  end loop;

  insert into public.team_match_minutes (match_result_id, team_id, match_length, recorded_by)
  values (p_match_id, p_team_id, p_length, v_user)
  on conflict (match_result_id, team_id) do update
    set match_length = excluded.match_length, recorded_by = excluded.recorded_by, updated_at = now();
  delete from public.team_match_minute_entries where match_result_id = p_match_id and team_id = p_team_id;

  insert into public.team_match_minute_entries (match_result_id, team_id, athlete_id, started, on_minute, off_minute, minutes)
  select p_match_id, p_team_id, (e ->> 'athleteId')::uuid, (e ->> 'started')::boolean,
         ((e ->> 'on')::numeric)::smallint, ((e ->> 'off')::numeric)::smallint,
         (coalesce(((e ->> 'off')::numeric)::integer, p_length) - coalesce(((e ->> 'on')::numeric)::integer, 0))::smallint
  from jsonb_array_elements(p_entries) as x(e);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The caller's and their accepted children's minutes, per team: matches and total.
create or replace function public.my_match_minutes()
returns table (team_id uuid, team_name text, athlete_id uuid, athlete_name text, matches integer, starts integer, minutes integer)
language sql
stable
security definer
set search_path = ''
as $$
  with athletes as (
    select (select auth.uid()) as athlete_id
    union
    select gl.athlete_id from public.guardian_links gl
    where gl.guardian_id = (select auth.uid()) and gl.status = 'accepted' and gl.consent_at is not null
  )
  select e.team_id, t.name, e.athlete_id, coalesce(nullif(ap.display_name, ''), ''),
         count(*)::integer, count(*) filter (where e.started)::integer, sum(e.minutes)::integer
  from athletes a
  join public.team_match_minute_entries e on e.athlete_id = a.athlete_id
  join public.match_results m on m.id = e.match_result_id and m.status = 'confirmed'
  join public.teams t on t.id = e.team_id
  left join public.athlete_profiles ap on ap.user_id = e.athlete_id
  where (select auth.uid()) is not null
  group by e.team_id, t.name, e.athlete_id, ap.display_name
  order by t.name
  limit 20;
$$;

revoke all on function public.is_team_owner(uuid) from public, anon;
revoke all on function public.save_match_minutes(uuid, uuid, integer, jsonb) from public, anon;
revoke all on function public.my_match_minutes() from public, anon;
grant execute on function public.is_team_owner(uuid) to authenticated;
grant execute on function public.save_match_minutes(uuid, uuid, integer, jsonb) to authenticated;
grant execute on function public.my_match_minutes() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.save_match_minutes(uuid, uuid, integer, jsonb)', 'execute')
     or has_function_privilege('anon', 'public.my_match_minutes()', 'execute')
     or has_table_privilege('anon', 'public.team_match_minute_entries', 'select')
     or has_table_privilege('authenticated', 'public.team_match_minutes', 'insert')
     or has_table_privilege('authenticated', 'public.team_match_minute_entries', 'insert')
     or has_table_privilege('authenticated', 'public.team_match_minute_entries', 'update') then
    raise exception 'SQL74 privileges are wider than intended';
  end if;
end;
$$;

commit;
