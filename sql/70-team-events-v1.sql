-- 70-team-events-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL18/20 (team_members), SQL21 (is_accepted_guardian_for) and
-- SQL69 (coach_skill_assessments, for the PDPA fix at the end). Run as postgres.
-- Precheck: sql/70-team-events-precheck.sql.
--
-- Why: coach tools round 2. A coach schedules training sessions and matches for a team;
-- each accepted member, or their accepted guardian, answers "coming / not coming"; after
-- the session the coach ticks who came, which becomes each athlete's attendance record.
--
--   * team_events: the team's sessions and matches. Read by the team's creator, its
--     accepted members and their accepted guardians. Written only by save_team_event
--     (the creator; the client sends the event id, so a retried save updates the same
--     row instead of adding a second) and cancel_team_event.
--   * team_event_responses: one answer per event and athlete (yes/no), upserted by
--     respond_team_event from the athlete or an accepted guardian, until the start time.
--     No free text: a reason is not collected from minors.
--   * team_event_attendance: one row per event and accepted member, written by
--     set_team_attendance from the creator, replacing the event's list in one call.
--   * my_upcoming_team_events(limit): what an athlete or a guardian answers from: the
--     upcoming events of the caller and of their accepted children, with each answer.
--   Responses and attendance belong to the athlete's profile: deleting it (PDPA,
--   delete_my_athlete_data) deletes them.
--
-- PDPA fix for SQL69 (already applied, so fixed here): coach_skill_assessments pointed
-- only at auth.users, so erasing an athlete's data left pending or declined ratings
-- behind. It now also references athlete_profiles(user_id) on delete cascade.

begin;

do $$
begin
  if to_regclass('public.team_members') is null
     or to_regclass('public.athlete_profiles') is null
     or to_regprocedure('public.is_accepted_guardian_for(uuid)') is null
     or to_regclass('public.coach_skill_assessments') is null then
    raise exception 'Prerequisites missing: SQL18/20 team_members, SQL21 guardian links, SQL69 coach_skill_assessments';
  end if;
end;
$$;

create table if not exists public.team_events (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  kind text not null check (kind in ('training', 'match')),
  title text not null check (char_length(title) between 1 and 80),
  starts_at timestamptz not null,
  location text check (char_length(location) <= 120),
  note text check (char_length(note) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create index if not exists team_events_team_starts_idx on public.team_events (team_id, starts_at);

create table if not exists public.team_event_responses (
  event_id uuid not null references public.team_events(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  answer text not null check (answer in ('yes', 'no')),
  responded_by uuid references auth.users(id) on delete set null,
  responded_at timestamptz not null default now(),
  primary key (event_id, athlete_id)
);
create index if not exists team_event_responses_athlete_idx on public.team_event_responses (athlete_id);

create table if not exists public.team_event_attendance (
  event_id uuid not null references public.team_events(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  present boolean not null,
  marked_by uuid references auth.users(id) on delete set null,
  marked_at timestamptz not null default now(),
  primary key (event_id, athlete_id)
);
create index if not exists team_event_attendance_athlete_idx on public.team_event_attendance (athlete_id);

-- Who may see a team's events: its creator, its accepted members, their accepted guardians.
create or replace function public.can_view_team_events(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = (select auth.uid()))
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = p_team_id and tm.status = 'accepted'
          and (tm.athlete_id = (select auth.uid()) or public.is_accepted_guardian_for(tm.athlete_id))
      );
$$;

create or replace function public.is_team_creator(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = (select auth.uid()));
$$;

alter table public.team_events enable row level security;
alter table public.team_event_responses enable row level security;
alter table public.team_event_attendance enable row level security;
revoke all on table public.team_events, public.team_event_responses, public.team_event_attendance from public, anon, authenticated;
grant select on table public.team_events, public.team_event_responses, public.team_event_attendance to authenticated;

drop policy if exists team_events_select_team on public.team_events;
create policy team_events_select_team on public.team_events for select to authenticated
using ((select public.can_view_team_events(team_id)) or (select public.is_admin()));

-- An answer or an attendance mark: the coach of the team, the athlete, their guardian.
drop policy if exists team_event_responses_select_parties on public.team_event_responses;
create policy team_event_responses_select_parties on public.team_event_responses for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or exists (select 1 from public.team_events e where e.id = event_id and (select public.is_team_creator(e.team_id)))
  or (select public.is_admin())
);

drop policy if exists team_event_attendance_select_parties on public.team_event_attendance;
create policy team_event_attendance_select_parties on public.team_event_attendance for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or exists (select 1 from public.team_events e where e.id = event_id and (select public.is_team_creator(e.team_id)))
  or (select public.is_admin())
);

create or replace function public.save_team_event(
  p_event_id uuid, p_team_id uuid, p_kind text, p_title text, p_starts_at timestamptz, p_location text, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_title text := trim(coalesce(p_title, ''));
  v_location text := nullif(trim(coalesce(p_location, '')), '');
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_event_id is null or p_kind not in ('training', 'match')
     or char_length(v_title) not between 1 and 80
     or char_length(coalesce(v_location, '')) > 120 or char_length(coalesce(v_note, '')) > 300
     or p_starts_at is null or p_starts_at < now() - interval '1 day' or p_starts_at > now() + interval '366 days' then
    raise exception 'INVALID_EVENT' using errcode = '22023';
  end if;
  -- Lock the team: the creator only, and the upcoming-events cap is counted safely.
  perform 1 from public.teams t where t.id = p_team_id and t.created_by = v_user for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if not exists (select 1 from public.team_events where id = p_event_id)
     and (select count(*) from public.team_events e where e.team_id = p_team_id and e.cancelled_at is null and e.starts_at > now()) >= 200 then
    raise exception 'TOO_MANY_EVENTS' using errcode = '22023';
  end if;

  insert into public.team_events (id, team_id, kind, title, starts_at, location, note, created_by)
  values (p_event_id, p_team_id, p_kind, v_title, p_starts_at, v_location, v_note, v_user)
  on conflict (id) do update
    set kind = excluded.kind, title = excluded.title, starts_at = excluded.starts_at,
        location = excluded.location, note = excluded.note, updated_at = now()
    where public.team_events.team_id = p_team_id and public.team_events.cancelled_at is null
  returning id into v_id;
  if v_id is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  return v_id;
end;
$$;

create or replace function public.cancel_team_event(p_event_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select e.team_id into v_team from public.team_events e where e.id = p_event_id;
  if v_team is null or not public.is_team_creator(v_team) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  update public.team_events set cancelled_at = coalesce(cancelled_at, now()), updated_at = now() where id = p_event_id;
  return p_event_id;
end;
$$;

create or replace function public.respond_team_event(p_event_id uuid, p_athlete_id uuid, p_answer text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event public.team_events%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_answer not in ('yes', 'no') then raise exception 'INVALID_ANSWER' using errcode = '22023'; end if;
  -- The athlete themselves, or their accepted guardian.
  if p_athlete_id is distinct from v_user and not public.is_accepted_guardian_for(p_athlete_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into v_event from public.team_events where id = p_event_id;
  if not found or not exists (
    select 1 from public.team_members tm where tm.team_id = v_event.team_id and tm.athlete_id = p_athlete_id and tm.status = 'accepted'
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  if v_event.cancelled_at is not null or v_event.starts_at <= now() then
    raise exception 'EVENT_CLOSED' using errcode = '55000';
  end if;
  insert into public.team_event_responses (event_id, athlete_id, answer, responded_by)
  values (p_event_id, p_athlete_id, p_answer, v_user)
  on conflict (event_id, athlete_id) do update set answer = excluded.answer, responded_by = excluded.responded_by, responded_at = now();
  return p_event_id;
end;
$$;

create or replace function public.set_team_attendance(p_event_id uuid, p_present uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_event public.team_events%rowtype;
  v_count integer;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_event from public.team_events where id = p_event_id;
  if not found or not public.is_team_creator(v_event.team_id) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_event.cancelled_at is not null or v_event.starts_at > now() + interval '12 hours' then
    raise exception 'EVENT_NOT_STARTED' using errcode = '55000';
  end if;
  -- Everyone ticked must be an accepted member of this team.
  if exists (
    select 1 from unnest(coalesce(p_present, '{}'::uuid[])) as present(id)
    where not exists (select 1 from public.team_members tm where tm.team_id = v_event.team_id and tm.athlete_id = present.id and tm.status = 'accepted')
  ) then
    raise exception 'NOT_ON_TEAM' using errcode = '22023';
  end if;
  insert into public.team_event_attendance (event_id, athlete_id, present, marked_by)
  select p_event_id, tm.athlete_id, tm.athlete_id = any(coalesce(p_present, '{}'::uuid[])), v_user
  from public.team_members tm
  join public.athlete_profiles ap on ap.user_id = tm.athlete_id
  where tm.team_id = v_event.team_id and tm.status = 'accepted'
  on conflict (event_id, athlete_id) do update set present = excluded.present, marked_by = excluded.marked_by, marked_at = now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The upcoming events of the caller and of the children they are an accepted guardian
-- of, one row per event and athlete, with that athlete's answer. One indexed walk:
-- the athletes (the caller plus guardian_links), their accepted memberships
-- (team_members_athlete_status_idx), then each team's upcoming events
-- (team_events_team_starts_idx). Capped at 50 rows.
create or replace function public.my_upcoming_team_events(p_limit integer default 30)
returns table (
  event_id uuid, team_id uuid, team_name text, kind text, title text, starts_at timestamptz,
  location text, note text, athlete_id uuid, athlete_name text, answer text
)
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
  select e.id, e.team_id, t.name, e.kind, e.title, e.starts_at, e.location, e.note,
         tm.athlete_id, coalesce(nullif(ap.display_name, ''), ''), r.answer
  from athletes a
  join public.team_members tm on tm.athlete_id = a.athlete_id and tm.status = 'accepted'
  join public.teams t on t.id = tm.team_id
  join public.team_events e on e.team_id = tm.team_id and e.cancelled_at is null and e.starts_at > now()
  left join public.athlete_profiles ap on ap.user_id = tm.athlete_id
  left join public.team_event_responses r on r.event_id = e.id and r.athlete_id = tm.athlete_id
  where (select auth.uid()) is not null
  order by e.starts_at, ap.display_name
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
$$;

revoke all on function public.can_view_team_events(uuid) from public, anon;
revoke all on function public.is_team_creator(uuid) from public, anon;
revoke all on function public.save_team_event(uuid, uuid, text, text, timestamptz, text, text) from public, anon;
revoke all on function public.cancel_team_event(uuid) from public, anon;
revoke all on function public.respond_team_event(uuid, uuid, text) from public, anon;
revoke all on function public.set_team_attendance(uuid, uuid[]) from public, anon;
revoke all on function public.my_upcoming_team_events(integer) from public, anon;
grant execute on function public.can_view_team_events(uuid) to authenticated;
grant execute on function public.is_team_creator(uuid) to authenticated;
grant execute on function public.save_team_event(uuid, uuid, text, text, timestamptz, text, text) to authenticated;
grant execute on function public.cancel_team_event(uuid) to authenticated;
grant execute on function public.respond_team_event(uuid, uuid, text) to authenticated;
grant execute on function public.set_team_attendance(uuid, uuid[]) to authenticated;
grant execute on function public.my_upcoming_team_events(integer) to authenticated;

-- PDPA fix for SQL69: erasing an athlete's profile also erases ratings about them.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'coach_skill_assessments_athlete_profile_fkey') then
    delete from public.coach_skill_assessments c
    where not exists (select 1 from public.athlete_profiles ap where ap.user_id = c.athlete_id);
    alter table public.coach_skill_assessments
      add constraint coach_skill_assessments_athlete_profile_fkey
      foreign key (athlete_id) references public.athlete_profiles(user_id) on delete cascade;
  end if;
end;
$$;

do $$
begin
  if has_function_privilege('anon', 'public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)', 'execute')
     or has_function_privilege('anon', 'public.respond_team_event(uuid, uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.set_team_attendance(uuid, uuid[])', 'execute')
     or has_function_privilege('anon', 'public.cancel_team_event(uuid)', 'execute')
     or has_function_privilege('anon', 'public.my_upcoming_team_events(integer)', 'execute')
     or has_table_privilege('anon', 'public.team_events', 'select')
     or has_table_privilege('authenticated', 'public.team_events', 'insert')
     or has_table_privilege('authenticated', 'public.team_event_responses', 'insert')
     or has_table_privilege('authenticated', 'public.team_event_attendance', 'update') then
    raise exception 'SQL70 privileges are wider than intended';
  end if;
end;
$$;

commit;
