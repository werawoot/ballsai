-- 75-team-staff-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL70 (team events), SQL71 (announcements), SQL72 (training
-- plans), SQL73 (coach notes, untouched here) and SQL74 (minutes), all applied. Run as
-- postgres. Precheck: sql/75-team-staff-precheck.sql.
--
-- Why: coach tools round 7, option "ก" chosen by the owner on 10 Oct 2026. The coach who
-- created a team (the head coach) may add up to three assistant coaches. An assistant
-- helps with the everyday work and never touches the sensitive parts:
--
--   * assistant may: events, answers and attendance (SQL70); announcements and reminders
--     (SQL71); the training plan (SQL72); minutes played (SQL74); read the team page.
--   * head coach only: coach notes (SQL73) and skill ratings (SQL69), which this file
--     does not change; inviting or removing members; inviting or removing assistants;
--     registration, payment and the team itself.
--
--   * team_staff: one row per team and person: pending, accepted, declined or removed.
--     The head coach invites an existing account by email; the person accepts and
--     confirms they are 18 or over. An account with an athlete profile under 18, or a
--     member of the team, cannot be invited. At most three pending or accepted.
--   * is_team_staff(team): the head coach or an accepted assistant. Every SQL70/71/72/74
--     check that said "the creator" now says "the staff", through lock_team_for_staff,
--     which locks the team row and checks again after the lock, so removing an
--     assistant takes effect at once even against a save already waiting.
--   * Athletes and guardians see the team's head coach and assistants by name
--     (my_team_staff); nobody but the head coach sees an assistant's email.
--   * Who did it: events get updated_by; announcements, plans, attendance and minutes
--     already keep their author. Those author columns now become null when an account is
--     erased instead of deleting the team's events, messages and plans with it.
-- PDPA: an assistant reads members' names, answers, attendance and minutes of their own
-- team only, and never coach notes or skill ratings. Removing an assistant ends all of it.

begin;

do $$
begin
  if to_regprocedure('public.is_team_creator(uuid)') is null
     or to_regprocedure('public.save_team_event(uuid, uuid, text, text, timestamptz, text, text)') is null
     or to_regprocedure('public.post_team_announcement(uuid, uuid, text, boolean, boolean)') is null
     or to_regprocedure('public.save_team_training_plan(uuid, date, jsonb, boolean)') is null
     or to_regclass('public.coach_athlete_notes') is null
     or to_regprocedure('public.save_match_minutes(uuid, uuid, integer, jsonb)') is null then
    raise exception 'Prerequisites missing: SQL70, SQL71, SQL72, SQL73 and SQL74 must be applied first';
  end if;
end;
$$;

create table if not exists public.team_staff (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'removed')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  adult_confirmed_at timestamptz,
  unique (team_id, user_id),
  check (status <> 'accepted' or adult_confirmed_at is not null)
);
create index if not exists team_staff_user_status_idx on public.team_staff (user_id, status);

alter table public.team_staff enable row level security;
revoke all on table public.team_staff from public, anon, authenticated;
grant select on table public.team_staff to authenticated;

-- Who changed an event last (the creator stays in created_by).
alter table public.team_events add column if not exists updated_by uuid references auth.users(id) on delete set null;

-- With more than one person writing for a team, an erased account must not take the
-- team's events, messages or plans with it: the author becomes null instead.
do $$
declare
  v_target record;
  v_name text;
begin
  for v_target in
    select * from (values ('team_events', 'created_by'), ('team_announcements', 'created_by'), ('team_training_plans', 'updated_by')) as x(tbl, col)
  loop
    for v_name in
      select c.conname from pg_constraint c
      join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.conrelid = format('public.%I', v_target.tbl)::regclass and c.contype = 'f' and a.attname = v_target.col
    loop
      execute format('alter table public.%I drop constraint %I', v_target.tbl, v_name);
    end loop;
    execute format('alter table public.%I alter column %I drop not null', v_target.tbl, v_target.col);
    execute format('alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete set null',
                   v_target.tbl, v_target.tbl || '_' || v_target.col || '_fkey', v_target.col);
  end loop;
end;
$$;

-- An accepted assistant of this team (not the head coach).
create or replace function public.is_team_assistant(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_staff s
    where s.team_id = p_team_id and s.user_id = (select auth.uid()) and s.status = 'accepted'
  );
$$;

-- The head coach (the team's creator) or an accepted assistant.
create or replace function public.is_team_staff(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.teams t where t.id = p_team_id and t.created_by = (select auth.uid()))
      or exists (
        select 1 from public.team_staff s
        where s.team_id = p_team_id and s.user_id = (select auth.uid()) and s.status = 'accepted'
      );
$$;

-- For the staff functions only (never granted to a role): check, lock the team row, and
-- check again. The second check reads after the lock, so an assistant removed while this
-- call waited is refused. Every staff function locks the team before anything else.
create or replace function public.lock_team_for_staff(p_team_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if auth.uid() is null or not public.is_team_staff(p_team_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select t.name into v_name from public.teams t where t.id = p_team_id for update;
  if not found or not public.is_team_staff(p_team_id) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  return v_name;
end;
$$;

-- A staff row: the person themselves, the head coach, admins. Nobody writes directly.
drop policy if exists team_staff_select_parties on public.team_staff;
create policy team_staff_select_parties on public.team_staff for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_team_creator(team_id))
  or (select public.is_admin())
);

-- An assistant reads the team's member rows (names come through athlete_profiles RLS,
-- as they do for the head coach). Read only; the existing policies are unchanged.
drop policy if exists team_members_select_staff on public.team_members;
create policy team_members_select_staff on public.team_members for select to authenticated
using ((select public.is_team_assistant(team_id)));

-- SQL70, SQL71 and SQL74 read policies: "the creator" becomes "the staff".
drop policy if exists team_event_responses_select_parties on public.team_event_responses;
create policy team_event_responses_select_parties on public.team_event_responses for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or exists (select 1 from public.team_events e where e.id = event_id and (select public.is_team_staff(e.team_id)))
  or (select public.is_admin())
);

drop policy if exists team_event_attendance_select_parties on public.team_event_attendance;
create policy team_event_attendance_select_parties on public.team_event_attendance for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or exists (select 1 from public.team_events e where e.id = event_id and (select public.is_team_staff(e.team_id)))
  or (select public.is_admin())
);

drop policy if exists team_announcements_select_parties on public.team_announcements;
create policy team_announcements_select_parties on public.team_announcements for select to authenticated
using (
  (select public.is_team_staff(team_id))
  or (select public.is_team_announcement_recipient(id))
  or (select public.is_admin())
);

drop policy if exists team_match_minutes_select_owner on public.team_match_minutes;
create policy team_match_minutes_select_owner on public.team_match_minutes for select to authenticated
using ((select public.is_team_staff(team_id)) or (select public.is_admin()));

drop policy if exists team_match_minute_entries_select_parties on public.team_match_minute_entries;
create policy team_match_minute_entries_select_parties on public.team_match_minute_entries for select to authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_accepted_guardian_for(athlete_id))
  or (select public.is_team_staff(team_id))
  or (select public.is_admin())
);

-- SQL70-74 functions, redefined. Each body is the applied one with only its owner check
-- changed (and updated_by set on events); team_training_plans and team_events read
-- policies follow can_view_team_events.

create or replace function public.can_view_team_events(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_team_staff(p_team_id)
      or exists (
        select 1 from public.team_members tm
        where tm.team_id = p_team_id and tm.status = 'accepted'
          and (tm.athlete_id = (select auth.uid()) or public.is_accepted_guardian_for(tm.athlete_id))
      );
$$;

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
  -- Lock the team: its staff only (sql/75), and the upcoming-events cap is counted safely.
  perform public.lock_team_for_staff(p_team_id);
  if not exists (select 1 from public.team_events where id = p_event_id)
     and (select count(*) from public.team_events e where e.team_id = p_team_id and e.cancelled_at is null and e.starts_at > now()) >= 200 then
    raise exception 'TOO_MANY_EVENTS' using errcode = '22023';
  end if;

  insert into public.team_events (id, team_id, kind, title, starts_at, location, note, created_by)
  values (p_event_id, p_team_id, p_kind, v_title, p_starts_at, v_location, v_note, v_user)
  on conflict (id) do update
    set kind = excluded.kind, title = excluded.title, starts_at = excluded.starts_at,
        location = excluded.location, note = excluded.note, updated_by = v_user, updated_at = now()
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
  if v_team is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  perform public.lock_team_for_staff(v_team);
  update public.team_events set cancelled_at = coalesce(cancelled_at, now()), updated_by = auth.uid(), updated_at = now() where id = p_event_id;
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
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  perform public.lock_team_for_staff(v_event.team_id);
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

create or replace function public.is_team_announcement_author(p_announcement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_announcements a
    where a.id = p_announcement_id and public.is_team_staff(a.team_id)
  );
$$;

create or replace function public.post_team_announcement(
  p_id uuid, p_team_id uuid, p_body text, p_to_athletes boolean, p_to_guardians boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_body text := trim(coalesce(p_body, ''));
  v_team text;
  v_existing uuid;
  v_count integer;
  v_row record;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_id is null or char_length(v_body) not between 1 and 500
     or not (coalesce(p_to_athletes, false) or coalesce(p_to_guardians, false)) then
    raise exception 'INVALID_ANNOUNCEMENT' using errcode = '22023';
  end if;
  -- Lock the team: its staff only (sql/75), and the daily cap is counted safely.
  v_team := public.lock_team_for_staff(p_team_id);

  -- A retry of the same message: report what was sent, send nothing again.
  select a.team_id into v_existing from public.team_announcements a where a.id = p_id;
  if found then
    if v_existing <> p_team_id then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
    select count(*) into v_count from public.team_announcement_recipients r where r.announcement_id = p_id;
    return v_count;
  end if;
  if (select count(*) from public.team_announcements a
      where a.team_id = p_team_id and a.created_at > now() - interval '1 day') >= 30 then
    raise exception 'TOO_MANY_ANNOUNCEMENTS' using errcode = '22023';
  end if;

  insert into public.team_announcements (id, team_id, body, to_athletes, to_guardians, created_by)
  values (p_id, p_team_id, v_body, coalesce(p_to_athletes, false), coalesce(p_to_guardians, false), v_user);

  -- Recipients, fixed now. A guardian of two members gets one row (the first child).
  insert into public.team_announcement_recipients (announcement_id, user_id, athlete_id, is_guardian)
  select distinct on (who.user_id) p_id, who.user_id, who.athlete_id, who.is_guardian
  from (
    select tm.athlete_id as user_id, tm.athlete_id, false as is_guardian
    from public.team_members tm
    join public.athlete_profiles ap on ap.user_id = tm.athlete_id
    where p_to_athletes and tm.team_id = p_team_id and tm.status = 'accepted'
    union all
    select gl.guardian_id, tm.athlete_id, true
    from public.team_members tm
    join public.guardian_links gl on gl.athlete_id = tm.athlete_id and gl.status = 'accepted' and gl.consent_at is not null
    where p_to_guardians and tm.team_id = p_team_id and tm.status = 'accepted'
  ) who
  where who.user_id <> v_user
  order by who.user_id, who.is_guardian, who.athlete_id;
  get diagnostics v_count = row_count;

  for v_row in select r.user_id, r.is_guardian from public.team_announcement_recipients r where r.announcement_id = p_id loop
    perform public.create_notification(
      v_row.user_id, 'team_announcement',
      left('ประกาศจากทีม ' || v_team, 160),
      left(v_body, 160),
      case when v_row.is_guardian then '/guardian' else '/team-members' end,
      'team_announcement:' || p_id::text || ':' || v_row.user_id::text
    );
  end loop;
  return v_count;
end;
$$;

create or replace function public.delete_team_announcement(p_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select a.team_id into v_team from public.team_announcements a where a.id = p_id;
  if v_team is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  -- The team first, then the message: the same lock order as every staff function.
  perform public.lock_team_for_staff(v_team);
  perform 1 from public.team_announcements a where a.id = p_id for update;
  -- The notifications it created, by their exact keys (source_key is unique and indexed).
  delete from public.notifications n
  where n.source_key in (
    select 'team_announcement:' || p_id::text || ':' || r.user_id::text
    from public.team_announcement_recipients r where r.announcement_id = p_id
  );
  delete from public.team_announcements where id = p_id;
  return p_id;
end;
$$;

create or replace function public.remind_team_event(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.team_events%rowtype;
  v_team_id uuid;
  v_team text;
  v_count integer := 0;
  v_row record;
  v_stamp text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select e.team_id into v_team_id from public.team_events e where e.id = p_event_id;
  if v_team_id is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  -- The team first, then the event: the same lock order as every staff function.
  perform public.lock_team_for_staff(v_team_id);
  select * into v_event from public.team_events where id = p_event_id for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_event.cancelled_at is not null or v_event.starts_at <= now() then raise exception 'EVENT_CLOSED' using errcode = '55000'; end if;
  if v_event.reminded_at is not null and v_event.reminded_at > now() - interval '6 hours' then
    raise exception 'REMINDED_RECENTLY' using errcode = '55000';
  end if;
  select t.name into v_team from public.teams t where t.id = v_event.team_id;
  v_stamp := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI');

  for v_row in
    select distinct on (who.user_id) who.user_id, who.is_guardian
    from (
      select tm.athlete_id as user_id, false as is_guardian
      from public.team_members tm
      where tm.team_id = v_event.team_id and tm.status = 'accepted'
        and not exists (select 1 from public.team_event_responses r where r.event_id = p_event_id and r.athlete_id = tm.athlete_id)
      union all
      select gl.guardian_id, true
      from public.team_members tm
      join public.guardian_links gl on gl.athlete_id = tm.athlete_id and gl.status = 'accepted' and gl.consent_at is not null
      where tm.team_id = v_event.team_id and tm.status = 'accepted'
        and not exists (select 1 from public.team_event_responses r where r.event_id = p_event_id and r.athlete_id = tm.athlete_id)
    ) who
    order by who.user_id, who.is_guardian
  loop
    perform public.create_notification(
      v_row.user_id, 'team_event_reminder',
      left('ทีม ' || v_team || ' รอคำตอบ: ' || v_event.title, 160),
      'กดตอบว่ามาได้หรือไม่ได้ก่อนเวลานัด',
      case when v_row.is_guardian then '/guardian' else '/team-members' end,
      'team_event_reminder:' || p_event_id::text || ':' || v_row.user_id::text || ':' || v_stamp
    );
    v_count := v_count + 1;
  end loop;
  update public.team_events set reminded_at = now() where id = p_event_id;
  return v_count;
end;
$$;

create or replace function public.save_team_training_plan(p_team_id uuid, p_week_start date, p_days jsonb, p_notify boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team text;
  v_this_week date := public.bangkok_week_start();
  v_day jsonb;
  v_block jsonb;
  v_seen integer[] := '{}';
  v_weekday integer;
  v_minutes integer;
  v_total integer;
  v_title text;
  v_notified timestamptz;
  v_count integer := 0;
  v_row record;
  v_stamp text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_week_start is null or extract(isodow from p_week_start) <> 1
     or p_week_start < v_this_week - 7 or p_week_start > v_this_week + 56
     or p_days is null or jsonb_typeof(p_days) <> 'array' or jsonb_array_length(p_days) > 7 then
    raise exception 'INVALID_PLAN' using errcode = '22023';
  end if;

  -- Every day and every drill, checked here: the table only stores what passed.
  for v_day in select value from jsonb_array_elements(p_days) loop
    if jsonb_typeof(v_day) <> 'object' or jsonb_typeof(v_day -> 'day') <> 'number'
       or jsonb_typeof(v_day -> 'blocks') <> 'array' or jsonb_typeof(coalesce(v_day -> 'title', '""'::jsonb)) <> 'string' then
      raise exception 'INVALID_PLAN' using errcode = '22023';
    end if;
    v_weekday := (v_day ->> 'day')::numeric;
    v_title := trim(coalesce(v_day ->> 'title', ''));
    if v_weekday not between 0 and 6 or (v_day ->> 'day')::numeric <> v_weekday or v_weekday = any(v_seen)
       or char_length(v_title) > 60
       or jsonb_array_length(v_day -> 'blocks') not between 1 and 8 then
      raise exception 'INVALID_PLAN' using errcode = '22023';
    end if;
    v_seen := v_seen || v_weekday;
    v_total := 0;
    for v_block in select value from jsonb_array_elements(v_day -> 'blocks') loop
      if jsonb_typeof(v_block) <> 'object'
         or jsonb_typeof(v_block -> 'name') <> 'string' or char_length(trim(v_block ->> 'name')) not between 1 and 80
         or jsonb_typeof(v_block -> 'minutes') <> 'number' or jsonb_typeof(v_block -> 'load') <> 'number'
         or (v_block ? 'drill' and jsonb_typeof(v_block -> 'drill') <> 'null'
             and (jsonb_typeof(v_block -> 'drill') <> 'string' or (v_block ->> 'drill') !~ '^[a-z0-9-]{1,60}$')) then
        raise exception 'INVALID_PLAN' using errcode = '22023';
      end if;
      v_minutes := (v_block ->> 'minutes')::numeric;
      if (v_block ->> 'minutes')::numeric <> v_minutes or v_minutes not between 1 and 120
         or (v_block ->> 'load')::numeric not in (1, 2, 3) then
        raise exception 'INVALID_PLAN' using errcode = '22023';
      end if;
      v_total := v_total + v_minutes;
    end loop;
    if v_total > 240 then raise exception 'INVALID_PLAN' using errcode = '22023'; end if;
  end loop;

  -- The team's staff only (sql/75); the lock makes concurrent saves of one week queue.
  v_team := public.lock_team_for_staff(p_team_id);

  if jsonb_array_length(p_days) = 0 then
    delete from public.team_training_plans where team_id = p_team_id and week_start = p_week_start;
    return 0;
  end if;

  -- Stored as checked, in weekday order, with the text trimmed.
  insert into public.team_training_plans (team_id, week_start, days, updated_by)
  values (
    p_team_id, p_week_start,
    (select jsonb_agg(jsonb_build_object(
        'day', (d ->> 'day')::integer,
        'title', trim(coalesce(d ->> 'title', '')),
        'blocks', (select jsonb_agg(jsonb_build_object(
            'drill', nullif(b ->> 'drill', ''),
            'name', trim(b ->> 'name'),
            'minutes', (b ->> 'minutes')::integer,
            'load', (b ->> 'load')::integer) order by o)
          from jsonb_array_elements(d -> 'blocks') with ordinality as x(b, o)))
      order by (d ->> 'day')::integer)
     from jsonb_array_elements(p_days) as y(d)),
    v_user
  )
  on conflict (team_id, week_start) do update
    set days = excluded.days, updated_by = excluded.updated_by, updated_at = now()
  returning notified_at into v_notified;

  if not coalesce(p_notify, false) then return 0; end if;
  -- At most once every 6 hours per week: a quick re-save does not notify again.
  if v_notified is not null and v_notified > now() - interval '6 hours' then return -1; end if;

  v_stamp := to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MI');
  for v_row in
    select distinct on (who.user_id) who.user_id, who.is_guardian
    from (
      select tm.athlete_id as user_id, false as is_guardian
      from public.team_members tm
      where tm.team_id = p_team_id and tm.status = 'accepted'
      union all
      select gl.guardian_id, true
      from public.team_members tm
      join public.guardian_links gl on gl.athlete_id = tm.athlete_id and gl.status = 'accepted' and gl.consent_at is not null
      where tm.team_id = p_team_id and tm.status = 'accepted'
    ) who
    where who.user_id <> v_user
    order by who.user_id, who.is_guardian
  loop
    perform public.create_notification(
      v_row.user_id, 'team_training_plan',
      left('แผนซ้อมทีม ' || v_team, 160),
      'สัปดาห์ที่เริ่ม ' || to_char(p_week_start, 'DD/MM') || ' · ซ้อม ' || jsonb_array_length(p_days) || ' วัน',
      case when v_row.is_guardian then '/guardian' else '/team-members' end,
      'team_training_plan:' || p_team_id::text || ':' || p_week_start::text || ':' || v_row.user_id::text || ':' || v_stamp
    );
    v_count := v_count + 1;
  end loop;
  update public.team_training_plans set notified_at = now() where team_id = p_team_id and week_start = p_week_start;
  return v_count;
end;
$$;

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
  -- The staff of a team that played in this confirmed match (sql/75). The team row is
  -- locked so concurrent saves of one sheet queue and the last one wins whole.
  perform public.lock_team_for_staff(p_team_id);
  if not exists (
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

-- The head coach invites an existing account by email. A retry, or inviting someone
-- already pending or accepted, returns the same row and sends nothing again.
create or replace function public.invite_team_staff(p_team_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_team text;
  v_invitee uuid;
  v_existing public.team_staff%rowtype;
  v_id uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if char_length(v_email) not between 3 and 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL' using errcode = '22023';
  end if;
  -- The head coach only. The team row is locked, so the cap of three holds under load.
  select t.name into v_team from public.teams t where t.id = p_team_id and t.created_by = v_user for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;

  select u.id into v_invitee from auth.users u where lower(u.email) = v_email limit 1;
  if v_invitee is null then raise exception 'USER_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_invitee = v_user then raise exception 'CANNOT_INVITE_SELF' using errcode = '22023'; end if;
  if exists (select 1 from public.team_members tm where tm.team_id = p_team_id and tm.athlete_id = v_invitee and tm.status in ('pending', 'accepted')) then
    raise exception 'STAFF_IS_MEMBER' using errcode = '22023';
  end if;
  if exists (select 1 from public.athlete_profiles ap where ap.user_id = v_invitee and ap.birth_date > (current_date - interval '18 years')::date) then
    raise exception 'STAFF_UNDER_18' using errcode = '22023';
  end if;

  select * into v_existing from public.team_staff s where s.team_id = p_team_id and s.user_id = v_invitee;
  if found and v_existing.status in ('pending', 'accepted') then return v_existing.id; end if;
  if (select count(*) from public.team_staff s where s.team_id = p_team_id and s.status in ('pending', 'accepted')) >= 3 then
    raise exception 'TOO_MANY_STAFF' using errcode = '22023';
  end if;

  insert into public.team_staff (team_id, user_id, invited_by)
  values (p_team_id, v_invitee, v_user)
  on conflict (team_id, user_id) do update
    set status = 'pending', invited_by = excluded.invited_by, invited_at = now(), responded_at = null, adult_confirmed_at = null
  returning id into v_id;

  perform public.create_notification(
    v_invitee, 'team_invite',
    left('คำเชิญเป็นผู้ช่วยโค้ชทีม ' || v_team, 160),
    'ตอบรับหรือปฏิเสธได้ที่หน้าทีม',
    '/team-members',
    'team_staff_invite:' || v_id::text || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS')
  );
  return v_id;
end;
$$;

-- The invited person answers. Accepting needs the 18-or-over confirmation. Answering the
-- same way again returns the same status; anything else after an answer is refused.
create or replace function public.respond_team_staff(p_staff_id uuid, p_accept boolean, p_adult boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team_id uuid;
  v_row public.team_staff%rowtype;
  v_team public.teams%rowtype;
  v_status text := case when coalesce(p_accept, false) then 'accepted' else 'declined' end;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select s.team_id into v_team_id from public.team_staff s where s.id = p_staff_id and s.user_id = v_user;
  if v_team_id is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  -- The team first, then the row: the same lock order as every staff function.
  select * into v_team from public.teams t where t.id = v_team_id for update;
  select * into v_row from public.team_staff s where s.id = p_staff_id and s.user_id = v_user for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_row.status = v_status then return v_status; end if;
  if v_row.status <> 'pending' then raise exception 'STAFF_INVITE_CLOSED' using errcode = '55000'; end if;
  if v_status = 'accepted' then
    if not coalesce(p_adult, false) then raise exception 'ADULT_REQUIRED' using errcode = '22023'; end if;
    if exists (select 1 from public.athlete_profiles ap where ap.user_id = v_user and ap.birth_date > (current_date - interval '18 years')::date) then
      raise exception 'STAFF_UNDER_18' using errcode = '22023';
    end if;
  end if;

  update public.team_staff
  set status = v_status, responded_at = now(), adult_confirmed_at = case when v_status = 'accepted' then now() end
  where id = p_staff_id;

  if v_status = 'accepted' then
    perform public.create_notification(
      v_team.created_by, 'team_invite',
      left('ผู้ช่วยโค้ชตอบรับแล้ว · ทีม ' || v_team.name, 160),
      'ดูรายชื่อทีมงานได้ที่หน้าทีม',
      '/team-members/' || v_team.id::text,
      'team_staff_accepted:' || p_staff_id::text || ':' || to_char(now() at time zone 'UTC', 'YYYYMMDDHH24MISS')
    );
  end if;
  return v_status;
end;
$$;

-- The head coach removes an assistant or withdraws an invitation; an assistant may leave.
-- The team row is locked first, so a save the assistant already started either finishes
-- before this or is refused after it.
create or replace function public.remove_team_staff(p_staff_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team_id uuid;
  v_person uuid;
  v_head uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select s.team_id, s.user_id into v_team_id, v_person from public.team_staff s where s.id = p_staff_id;
  if v_team_id is null then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  select t.created_by into v_head from public.teams t where t.id = v_team_id for update;
  if v_user is distinct from v_head and v_user is distinct from v_person then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  update public.team_staff set status = 'removed', responded_at = now()
  where id = p_staff_id and status <> 'removed';
  return p_staff_id;
end;
$$;

-- The team as the staff page needs it, for the head coach or an accepted assistant.
create or replace function public.team_for_staff(p_team_id uuid)
returns table (id uuid, name text, tournament_id uuid, tournament_name text, start_date date, is_head boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.name, t.tournament_id, tr.name, tr.start_date, t.created_by = (select auth.uid())
  from public.teams t
  left join public.tournaments tr on tr.id = t.tournament_id
  where t.id = p_team_id and public.is_team_staff(p_team_id);
$$;

-- The team's staff, for its staff: the head coach first, then accepted assistants. The
-- head coach also sees pending invitations and each assistant's email.
create or replace function public.team_staff_list(p_team_id uuid)
returns table (id uuid, user_id uuid, name text, email text, status text, is_head boolean, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select * from (
    select null::uuid as id, t.created_by as user_id,
           coalesce(nullif(trim(p.full_name), ''), nullif(trim(ap.display_name), ''), '') as name,
           null::text as email, 'accepted'::text as status, true as is_head, t.created_by = (select auth.uid()) as is_me
    from public.teams t
    left join public.profiles p on p.id = t.created_by
    left join public.athlete_profiles ap on ap.user_id = t.created_by
    where t.id = p_team_id
    union all
    select s.id, s.user_id,
           coalesce(nullif(trim(p.full_name), ''), nullif(trim(ap.display_name), ''), ''),
           case when public.is_team_creator(p_team_id) then u.email::text end,
           s.status, false, s.user_id = (select auth.uid())
    from public.team_staff s
    join auth.users u on u.id = s.user_id
    left join public.profiles p on p.id = s.user_id
    left join public.athlete_profiles ap on ap.user_id = s.user_id
    where s.team_id = p_team_id
      and (s.status = 'accepted' or (s.status = 'pending' and public.is_team_creator(p_team_id)))
  ) staff
  where public.is_team_staff(p_team_id)
  order by is_head desc, status, name
  limit 10;
$$;

-- The caller's own staff invitations and teams (pending or accepted).
create or replace function public.my_staff_teams()
returns table (staff_id uuid, team_id uuid, team_name text, tournament_name text, status text, head_name text, invited_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, t.id, t.name, tr.name, s.status,
         coalesce(nullif(trim(p.full_name), ''), nullif(trim(ap.display_name), ''), ''), s.invited_at
  from public.team_staff s
  join public.teams t on t.id = s.team_id
  left join public.tournaments tr on tr.id = t.tournament_id
  left join public.profiles p on p.id = t.created_by
  left join public.athlete_profiles ap on ap.user_id = t.created_by
  where s.user_id = (select auth.uid()) and s.status in ('pending', 'accepted')
  order by s.status desc, s.invited_at desc
  limit 50;
$$;

-- The staff of the caller's teams and of their accepted children's teams, so athletes and
-- guardians know every adult who works with the team. Names only.
create or replace function public.my_team_staff()
returns table (team_id uuid, team_name text, name text, is_head boolean)
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
  ), my_teams as (
    select distinct tm.team_id from public.team_members tm
    join athletes a on a.athlete_id = tm.athlete_id
    where tm.status = 'accepted'
  ), staff as (
    select t.id as team_id, t.name as team_name, t.created_by as user_id, true as is_head
    from my_teams m join public.teams t on t.id = m.team_id
    union all
    select t.id, t.name, s.user_id, false
    from my_teams m join public.teams t on t.id = m.team_id
    join public.team_staff s on s.team_id = m.team_id and s.status = 'accepted'
  )
  select st.team_id, st.team_name, coalesce(nullif(trim(p.full_name), ''), nullif(trim(ap.display_name), ''), ''), st.is_head
  from staff st
  left join public.profiles p on p.id = st.user_id
  left join public.athlete_profiles ap on ap.user_id = st.user_id
  where (select auth.uid()) is not null
  order by st.team_name, st.team_id, st.is_head desc
  limit 80;
$$;

revoke all on function public.is_team_assistant(uuid) from public, anon;
revoke all on function public.is_team_staff(uuid) from public, anon;
revoke all on function public.lock_team_for_staff(uuid) from public, anon, authenticated;
revoke all on function public.invite_team_staff(uuid, text) from public, anon;
revoke all on function public.respond_team_staff(uuid, boolean, boolean) from public, anon;
revoke all on function public.remove_team_staff(uuid) from public, anon;
revoke all on function public.team_for_staff(uuid) from public, anon;
revoke all on function public.team_staff_list(uuid) from public, anon;
revoke all on function public.my_staff_teams() from public, anon;
revoke all on function public.my_team_staff() from public, anon;
grant execute on function public.is_team_assistant(uuid) to authenticated;
grant execute on function public.is_team_staff(uuid) to authenticated;
grant execute on function public.invite_team_staff(uuid, text) to authenticated;
grant execute on function public.respond_team_staff(uuid, boolean, boolean) to authenticated;
grant execute on function public.remove_team_staff(uuid) to authenticated;
grant execute on function public.team_for_staff(uuid) to authenticated;
grant execute on function public.team_staff_list(uuid) to authenticated;
grant execute on function public.my_staff_teams() to authenticated;
grant execute on function public.my_team_staff() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.invite_team_staff(uuid, text)', 'execute')
     or has_function_privilege('anon', 'public.my_team_staff()', 'execute')
     or has_function_privilege('authenticated', 'public.lock_team_for_staff(uuid)', 'execute')
     or has_table_privilege('anon', 'public.team_staff', 'select')
     or has_table_privilege('authenticated', 'public.team_staff', 'insert')
     or has_table_privilege('authenticated', 'public.team_staff', 'update')
     or has_table_privilege('authenticated', 'public.team_staff', 'delete') then
    raise exception 'SQL75 privileges are wider than intended';
  end if;
end;
$$;

commit;
