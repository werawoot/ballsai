-- Rollback for SQL75 only (not part of the apply order). Puts back the SQL70-74 checks
-- and read policies exactly as applied (head coach only), then removes team_staff, every
-- invitation and assistant in it, and the new functions. Events, messages, plans and
-- minutes an assistant wrote stay with the team. The author columns go back to cascade
-- and NOT NULL where no row has lost its author; if one has, they stay nullable.
begin;

do $$
begin
  if to_regclass('public.team_staff') is null then
    raise exception 'SQL75 is not applied';
  end if;
end;
$$;

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

create or replace function public.is_team_announcement_author(p_announcement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_announcements a join public.teams t on t.id = a.team_id
    where a.id = p_announcement_id and t.created_by = (select auth.uid())
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
  -- Lock the team: the creator only, and the daily cap is counted safely.
  select t.name into v_team from public.teams t where t.id = p_team_id and t.created_by = v_user for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;

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
  select a.team_id into v_team from public.team_announcements a where a.id = p_id for update;
  if v_team is null or not public.is_team_creator(v_team) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
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
  v_team text;
  v_count integer := 0;
  v_row record;
  v_stamp text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_event from public.team_events where id = p_event_id for update;
  if not found or not public.is_team_creator(v_event.team_id) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
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

  -- The creator only; the lock makes concurrent saves of one week queue.
  select t.name into v_team from public.teams t where t.id = p_team_id and t.created_by = v_user for update;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;

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

drop policy if exists team_announcements_select_parties on public.team_announcements;
create policy team_announcements_select_parties on public.team_announcements for select to authenticated
using (
  (select public.is_team_creator(team_id))
  or (select public.is_team_announcement_recipient(id))
  or (select public.is_admin())
);

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

drop policy if exists team_members_select_staff on public.team_members;
drop policy if exists team_staff_select_parties on public.team_staff;

drop function if exists public.my_team_staff();
drop function if exists public.my_staff_teams();
drop function if exists public.team_staff_list(uuid);
drop function if exists public.team_for_staff(uuid);
drop function if exists public.remove_team_staff(uuid);
drop function if exists public.respond_team_staff(uuid, boolean, boolean);
drop function if exists public.invite_team_staff(uuid, text);
drop function if exists public.lock_team_for_staff(uuid);
drop function if exists public.is_team_staff(uuid);
drop function if exists public.is_team_assistant(uuid);
drop table if exists public.team_staff;
alter table public.team_events drop column if exists updated_by;

do $$
declare
  v_target record;
  v_name text;
  v_nulls boolean;
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
    execute format('alter table public.%I add constraint %I foreign key (%I) references auth.users(id) on delete cascade',
                   v_target.tbl, v_target.tbl || '_' || v_target.col || '_fkey', v_target.col);
    execute format('select exists (select 1 from public.%I where %I is null)', v_target.tbl, v_target.col) into v_nulls;
    if v_nulls then
      raise notice '%.% keeps rows without an author and stays nullable', v_target.tbl, v_target.col;
    else
      execute format('alter table public.%I alter column %I set not null', v_target.tbl, v_target.col);
    end if;
  end loop;
end;
$$;

commit;
