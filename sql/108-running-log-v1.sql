-- 108-running-log-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Needs sql/21 (is_accepted_guardian_for) and SQL47 (delete_my_athlete_data, fingerprint 5957a694
-- on both projects, 26 Nov 2026).
-- Precheck: sql/108-running-log-precheck.sql. Postcheck: sql/108-running-log-postcheck.sql.
-- Rollback: sql/108-running-log-down.sql (drops the runs; only before anyone relies on them).
--
-- Why: running mode V1 (ADR-016, owner 25 Nov 2026: a new feature for everyone in DOENSAI; XP
-- none; a child's runs seen by the child and their linked guardian, not coaches). This file is
-- part 1: runs logged by hand and a weekly goal. No weight (part 2) and no plan (part 3).
-- What:
--   - run_logs: one run of one account (any role): date, metres, seconds; source self (AGENTS.md
--     rule 8: never shown as performance). request_id makes a retried save one run.
--     100 m to 100 km, 1 minute to 24 hours, no faster than 2:30 per km, from 2020 to today
--     (Asia/Bangkok), at most 10 a day per account.
--   - run_goals: one weekly goal per account, in runs (1-14) or km (1-300).
--   - RLS: the account reads, adds and removes its own; an accepted guardian reads; nobody else.
--     Nothing for anon.
--   - add_my_run, set_my_run_goal: the writes, with the checks above and coded errors.
--   - my_run_weeks(weeks): the account's totals per Monday-to-Sunday week (Bangkok), the current
--     week and the ones before, so the page never adds up rows itself.
--   - delete_my_athlete_data: SQL47's word for word, plus the runs and the goal.
-- Scale: every read is by (user_id, run_date) through run_logs_user_date_idx; the history is
-- paged by the app; 10 a day per account bounds the table to people times days.

begin;

do $$
begin
  if to_regprocedure('public.is_accepted_guardian_for(uuid)') is null then raise exception 'SQL108 needs sql/21 (is_accepted_guardian_for)'; end if;
  if to_regprocedure('public.delete_my_athlete_data()') is null then raise exception 'SQL108 needs delete_my_athlete_data (SQL47)'; end if;
end;
$$;

create table if not exists public.run_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  run_date date not null check (run_date >= date '2020-01-01'),
  distance_m integer not null check (distance_m between 100 and 100000),
  duration_s integer not null check (duration_s between 60 and 86400),
  created_at timestamptz not null default now(),
  -- No faster than 2:30 per km (150 s per 1000 m).
  constraint run_logs_pace_check check (duration_s::bigint * 1000 >= distance_m::bigint * 150),
  constraint run_logs_request_unique unique (user_id, request_id)
);
create index if not exists run_logs_user_date_idx on public.run_logs (user_id, run_date desc, created_at desc);

create table if not exists public.run_goals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  unit text not null check (unit in ('runs', 'km')),
  target integer not null check ((unit = 'runs' and target between 1 and 14) or (unit = 'km' and target between 1 and 300)),
  updated_at timestamptz not null default now()
);

alter table public.run_logs enable row level security;
alter table public.run_goals enable row level security;

drop policy if exists run_logs_select_own_or_guardian on public.run_logs;
create policy run_logs_select_own_or_guardian on public.run_logs for select to authenticated
  using (user_id = (select auth.uid()) or public.is_accepted_guardian_for(user_id));
drop policy if exists run_logs_insert_own on public.run_logs;
create policy run_logs_insert_own on public.run_logs for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists run_logs_delete_own on public.run_logs;
create policy run_logs_delete_own on public.run_logs for delete to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists run_goals_select_own_or_guardian on public.run_goals;
create policy run_goals_select_own_or_guardian on public.run_goals for select to authenticated
  using (user_id = (select auth.uid()) or public.is_accepted_guardian_for(user_id));
drop policy if exists run_goals_write_own on public.run_goals;
create policy run_goals_write_own on public.run_goals for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists run_goals_update_own on public.run_goals;
create policy run_goals_update_own on public.run_goals for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.run_logs, public.run_goals from public, anon, authenticated;
grant select, insert, delete on public.run_logs to authenticated;
grant select, insert, update on public.run_goals to authenticated;

create or replace function public.add_my_run(p_request_id uuid, p_run_date date, p_distance_m integer, p_duration_s integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null or p_run_date is null or p_distance_m is null or p_duration_s is null then
    raise exception 'RUN_INVALID' using errcode = '22023';
  end if;
  -- A retried save (the same request) is the run already saved.
  select id into v_id from public.run_logs where user_id = v_user_id and request_id = p_request_id;
  if found then
    return v_id;
  end if;
  if p_run_date > (now() at time zone 'Asia/Bangkok')::date or p_run_date < date '2020-01-01' then
    raise exception 'RUN_DATE_INVALID' using errcode = '22023';
  end if;
  if p_distance_m not between 100 and 100000 or p_duration_s not between 60 and 86400
     or p_duration_s::bigint * 1000 < p_distance_m::bigint * 150 then
    raise exception 'RUN_INVALID' using errcode = '22023';
  end if;
  if (select count(1) from public.run_logs where user_id = v_user_id and run_date = p_run_date) >= 10 then
    raise exception 'RUN_DAY_LIMIT' using errcode = 'P0001';
  end if;
  insert into public.run_logs (user_id, request_id, run_date, distance_m, duration_s)
  values (v_user_id, p_request_id, p_run_date, p_distance_m, p_duration_s)
  on conflict (user_id, request_id) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.run_logs where user_id = v_user_id and request_id = p_request_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.set_my_run_goal(p_unit text, p_target integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_unit is null or p_target is null or not ((p_unit = 'runs' and p_target between 1 and 14) or (p_unit = 'km' and p_target between 1 and 300)) then
    raise exception 'RUN_GOAL_INVALID' using errcode = '22023';
  end if;
  insert into public.run_goals (user_id, unit, target, updated_at)
  values (v_user_id, p_unit, p_target, now())
  on conflict (user_id) do update set unit = excluded.unit, target = excluded.target, updated_at = now();
end;
$$;

create or replace function public.my_run_weeks(p_weeks integer)
returns table (week_start date, runs integer, distance_m bigint, duration_s bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with bounds as (
    select (date_trunc('week', (now() at time zone 'Asia/Bangkok')::date))::date as this_week,
           greatest(1, least(coalesce(p_weeks, 1), 53)) as weeks
  ), weeks as (
    select (b.this_week - 7 * n)::date as week_start from bounds b, generate_series(0, b.weeks - 1) n
  )
  select w.week_start,
         count(r.id)::integer,
         coalesce(sum(r.distance_m), 0)::bigint,
         coalesce(sum(r.duration_s), 0)::bigint
  from weeks w
  left join public.run_logs r
    on r.user_id = (select auth.uid()) and r.run_date >= w.week_start and r.run_date < w.week_start + 7
  group by w.week_start
  order by w.week_start desc;
$$;

revoke all on function public.add_my_run(uuid, date, integer, integer), public.set_my_run_goal(text, integer), public.my_run_weeks(integer) from public, anon;
grant execute on function public.add_my_run(uuid, date, integer, integer), public.set_my_run_goal(text, integer), public.my_run_weeks(integer) to authenticated;

-- SQL47's delete_my_athlete_data, word for word, plus the runs and the goal (marked SQL108).
create or replace function public.delete_my_athlete_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_ranks integer := 0;
  v_highlight_paths text[] := '{}';
  v_attestations integer := 0;
  v_fields integer := 0;
  v_provenance integer := 0;
  v_events integer := 0;
  v_runs integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_user_id;

  -- Returned to the caller so the route can remove the objects the athlete owns in
  -- storage. SQL cannot delete storage objects.
  select coalesce(array_agg(media_path), '{}')
  into v_highlight_paths
  from public.athlete_highlights
  where athlete_id = v_user_id;

  update public.player_ranks
  set player_name = 'ATHLETE REMOVED',
      player_id = null
  where player_id = v_user_id;
  get diagnostics v_ranks = row_count;

  -- SQL47 addition. Scoped to this athlete only, in dependency order. Events first,
  -- because the append-only guard needs the transaction-local flag below and the
  -- provenance rows they reference are removed after.
  perform set_config('bds.pdpa_erasure', 'on', true);

  delete from public.verification_events e
  where e.subject_type = 'athlete_profile'
    and e.subject_id = v_user_id
    and e.provenance_id in (
      select p.id from public.data_provenance p
      where p.subject_type = 'athlete_profile'
        and p.subject_id = v_user_id
        and p.verification_method = 'coach_attestation:playing_position'
    );
  get diagnostics v_events = row_count;

  -- verification_evidence cascades from data_provenance.
  delete from public.data_provenance p
  where p.subject_type = 'athlete_profile'
    and p.subject_id = v_user_id
    and p.verification_method = 'coach_attestation:playing_position';
  get diagnostics v_provenance = row_count;

  delete from public.coach_verified_fields f where f.athlete_id = v_user_id;
  get diagnostics v_fields = row_count;

  -- Only rows ABOUT this athlete. Attestations this account wrote as a coach belong to
  -- the athletes they are about and are deliberately left in place.
  delete from public.coach_attestations a where a.athlete_id = v_user_id;
  get diagnostics v_attestations = row_count;

  perform set_config('bds.pdpa_erasure', 'off', true);

  -- SQL108 addition: running mode (ADR-016). Runs and the weekly goal belong to the account,
  -- whatever its role, and go with the rest of the athlete data.
  delete from public.run_logs where user_id = v_user_id;
  get diagnostics v_runs = row_count;
  delete from public.run_goals where user_id = v_user_id;

  delete from public.athlete_profiles where user_id = v_user_id;

  update public.profiles
  set full_name = '',
      phone = null,
      province = null,
      team = null,
      position = null,
      onboarding_persona = null,
      onboarding_sport = null,
      onboarding_goal = null,
      updated_at = now()
  where id = v_user_id;

  insert into public.account_deletion_requests (user_id, email)
  values (v_user_id, v_email)
  on conflict (user_id) do update set requested_at = now(), completed_at = null, completed_by = null;

  return jsonb_build_object(
    'anonymisedRankings', v_ranks,
    'highlightPaths', v_highlight_paths,
    'coachAttestationsRemoved', v_attestations,
    'coachVerifiedFieldsRemoved', v_fields,
    'coachProvenanceRemoved', v_provenance,
    'coachVerificationEventsRemoved', v_events,
    'runsRemoved', v_runs
  );
end;
$$;

revoke all on function public.delete_my_athlete_data() from public, anon, service_role;
grant execute on function public.delete_my_athlete_data() to authenticated;

commit;
