-- 72-team-training-plans-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL17/41/42 and SQL71 (notifications, create_notification and the
-- type list SQL71 set), SQL18/20 (team_members), SQL21 (guardian_links) and SQL70
-- (can_view_team_events). Run as postgres.
-- Precheck: sql/72-team-training-plans-precheck.sql.
--
-- Why: coach tools round 4. A coach plans the team's week: which days they train, and
-- for each day a short list of drills, each with minutes and a load (light, medium,
-- hard). A drill is either one from the app's reviewed drill library (content/training,
-- referred to by its id) or one the coach names. Athletes and their guardians see the
-- plan for this week and next, and can be notified when it is saved.
--
--   * team_training_plans: one row per team and week (week_start is the Monday, Bangkok
--     time). days is checked by the save function: at most 7 days, one per weekday, each
--     with a title of up to 60 characters and 1-8 drills of 1-120 minutes, at most 240
--     minutes a day. Read by the team's creator, its accepted members and their accepted
--     guardians (the same rule as team events); written only by the function.
--   * save_team_training_plan(team, week_start, days, notify): the team's creator only,
--     for a week from last week to 8 weeks ahead. An empty list of days deletes the
--     week's plan. With notify, accepted members and their guardians get one
--     notification (type team_training_plan), at most once every 6 hours per week.
--   * my_team_training_plans(): this week's and next week's plans of the caller's teams
--     and their children's teams, with the team name.
-- PDPA: no athlete is named in a plan; the coach's own drill names are plain text.

begin;

do $$
begin
  if to_regprocedure('public.create_notification(uuid, text, text, text, text, text)') is null
     or to_regprocedure('public.can_view_team_events(uuid)') is null
     or to_regclass('public.team_announcements') is null then
    raise exception 'Prerequisites missing: SQL17/42 notifications, SQL70 team events, SQL71 announcements';
  end if;
end;
$$;

create table if not exists public.team_training_plans (
  team_id uuid not null references public.teams(id) on delete cascade,
  week_start date not null check (extract(isodow from week_start) = 1),
  days jsonb not null check (jsonb_typeof(days) = 'array'),
  updated_by uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (team_id, week_start)
);

-- Widen the notification types. SQL71 owns the current list; keep all eight values.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder', 'team_training_plan'
  ));

alter table public.team_training_plans enable row level security;
revoke all on table public.team_training_plans from public, anon, authenticated;
grant select on table public.team_training_plans to authenticated;

drop policy if exists team_training_plans_select_team on public.team_training_plans;
create policy team_training_plans_select_team on public.team_training_plans for select to authenticated
using ((select public.can_view_team_events(team_id)) or (select public.is_admin()));

-- The Monday of the week a Bangkok date falls in.
create or replace function public.bangkok_week_start(p_at timestamptz default now())
returns date
language sql
stable
set search_path = ''
as $$
  select ((p_at at time zone 'Asia/Bangkok')::date - (extract(isodow from (p_at at time zone 'Asia/Bangkok')::date)::integer - 1));
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

-- This week's and next week's plans of the caller's teams and their children's teams.
create or replace function public.my_team_training_plans()
returns table (team_id uuid, team_name text, week_start date, days jsonb)
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
  ), teams as (
    select distinct tm.team_id from athletes a
    join public.team_members tm on tm.athlete_id = a.athlete_id and tm.status = 'accepted'
  )
  select p.team_id, t.name, p.week_start, p.days
  from teams x
  join public.team_training_plans p on p.team_id = x.team_id
    and p.week_start in (public.bangkok_week_start(), public.bangkok_week_start() + 7)
  join public.teams t on t.id = p.team_id
  where (select auth.uid()) is not null
  order by p.week_start, t.name
  limit 20;
$$;

revoke all on function public.bangkok_week_start(timestamptz) from public, anon;
revoke all on function public.save_team_training_plan(uuid, date, jsonb, boolean) from public, anon;
revoke all on function public.my_team_training_plans() from public, anon;
grant execute on function public.bangkok_week_start(timestamptz) to authenticated;
grant execute on function public.save_team_training_plan(uuid, date, jsonb, boolean) to authenticated;
grant execute on function public.my_team_training_plans() to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.save_team_training_plan(uuid, date, jsonb, boolean)', 'execute')
     or has_function_privilege('anon', 'public.my_team_training_plans()', 'execute')
     or has_table_privilege('anon', 'public.team_training_plans', 'select')
     or has_table_privilege('authenticated', 'public.team_training_plans', 'insert')
     or has_table_privilege('authenticated', 'public.team_training_plans', 'update')
     or has_function_privilege('authenticated', 'public.create_notification(uuid, text, text, text, text, text)', 'execute') then
    raise exception 'SQL72 privileges are wider than intended';
  end if;
end;
$$;

commit;
