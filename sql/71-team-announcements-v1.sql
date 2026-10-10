-- 71-team-announcements-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL17/41/42 (notifications, create_notification and the type
-- list SQL41 set), SQL18/20 (team_members), SQL21 (guardian_links) and SQL70 (team_events,
-- can_view_team_events, is_team_creator). Run as postgres.
-- Precheck: sql/71-team-announcements-precheck.sql.
--
-- Why: coach tools round 3. A coach sends one message to the team ("training moves to
-- 5 pm, wear red"), to the athletes, their guardians or both, and sees how many have
-- read it. The coach can also nudge the members who have not answered an event yet.
--
--   * team_announcements: one message, at most 500 characters, plain text. The id comes
--     from the app, so a retried post is the same message: it is not stored or sent twice.
--   * team_announcement_recipients: who it went to, fixed when it is sent (accepted
--     members and/or their accepted, consented guardians), and when each one read it.
--     A recipient reads their own row; the coach reads the rows of their team, which is
--     what the "read 14 of 18" count is made from.
--   * post_team_announcement: the team's creator only, at most 30 a day per team. Each
--     recipient gets one notification (type team_announcement).
--   * delete_team_announcement: the creator removes a message sent by mistake: the
--     message, its recipient rows and the notifications it created are deleted.
--   * mark_team_announcements_read / my_team_announcements: the recipient's side.
--   * remind_team_event: the creator notifies the accepted members who have not answered
--     an upcoming event, and their guardians; at most once every 6 hours per event.
-- PDPA: no names or contact details in the message rows; a recipient row is deleted
-- with the account or the athlete profile it was sent for.

begin;

do $$
begin
  if to_regclass('public.notifications') is null
     or to_regprocedure('public.create_notification(uuid, text, text, text, text, text)') is null
     or to_regclass('public.team_events') is null
     or to_regprocedure('public.is_team_creator(uuid)') is null
     or to_regprocedure('public.is_accepted_guardian_for(uuid)') is null then
    raise exception 'Prerequisites missing: SQL17/41/42 notifications, SQL21 guardian links, SQL70 team events';
  end if;
end;
$$;

create table if not exists public.team_announcements (
  id uuid primary key,
  team_id uuid not null references public.teams(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  to_athletes boolean not null,
  to_guardians boolean not null,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (to_athletes or to_guardians)
);
create index if not exists team_announcements_team_created_idx on public.team_announcements (team_id, created_at desc);

create table if not exists public.team_announcement_recipients (
  announcement_id uuid not null references public.team_announcements(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  is_guardian boolean not null,
  read_at timestamptz,
  primary key (announcement_id, user_id)
);
create index if not exists team_announcement_recipients_user_idx on public.team_announcement_recipients (user_id, announcement_id);
create index if not exists team_announcement_recipients_athlete_idx on public.team_announcement_recipients (athlete_id);

-- The last reminder per event, so a reminder cannot be repeated every few seconds.
alter table public.team_events add column if not exists reminded_at timestamptz;

-- Widen the notification types. SQL41 owns the current list; keep all six values.
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder'
  ));

alter table public.team_announcements enable row level security;
alter table public.team_announcement_recipients enable row level security;
revoke all on table public.team_announcements, public.team_announcement_recipients from public, anon, authenticated;
grant select on table public.team_announcements, public.team_announcement_recipients to authenticated;

-- The two policies ask about each other's table, so each asks through a definer helper
-- (a policy that reads a table whose policy reads back would recurse).
create or replace function public.is_team_announcement_recipient(p_announcement_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.team_announcement_recipients r where r.announcement_id = p_announcement_id and r.user_id = (select auth.uid()));
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

-- A message: the team's creator, the people it was sent to, admins.
drop policy if exists team_announcements_select_parties on public.team_announcements;
create policy team_announcements_select_parties on public.team_announcements for select to authenticated
using (
  (select public.is_team_creator(team_id))
  or (select public.is_team_announcement_recipient(id))
  or (select public.is_admin())
);

-- A recipient row: its own user, the team's creator (for the read count), admins.
drop policy if exists team_announcement_recipients_select_parties on public.team_announcement_recipients;
create policy team_announcement_recipients_select_parties on public.team_announcement_recipients for select to authenticated
using (
  user_id = (select auth.uid())
  or (select public.is_team_announcement_author(announcement_id))
  or (select public.is_admin())
);

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

create or replace function public.mark_team_announcements_read(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if coalesce(cardinality(p_ids), 0) > 50 then raise exception 'INVALID_IDS' using errcode = '22023'; end if;
  update public.team_announcement_recipients r
  set read_at = now()
  where r.user_id = auth.uid() and r.announcement_id = any(coalesce(p_ids, '{}'::uuid[])) and r.read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- The caller's messages, newest first, with the team they came from. A function because
-- an athlete or guardian cannot read the teams table for a team they did not create.
create or replace function public.my_team_announcements(p_limit integer default 20)
returns table (id uuid, team_name text, body text, created_at timestamptz, read_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, t.name, a.body, a.created_at, r.read_at
  from public.team_announcement_recipients r
  join public.team_announcements a on a.id = r.announcement_id
  join public.teams t on t.id = a.team_id
  where r.user_id = (select auth.uid())
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 50);
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

revoke all on function public.is_team_announcement_recipient(uuid) from public, anon;
revoke all on function public.is_team_announcement_author(uuid) from public, anon;
revoke all on function public.post_team_announcement(uuid, uuid, text, boolean, boolean) from public, anon;
revoke all on function public.delete_team_announcement(uuid) from public, anon;
revoke all on function public.mark_team_announcements_read(uuid[]) from public, anon;
revoke all on function public.my_team_announcements(integer) from public, anon;
revoke all on function public.remind_team_event(uuid) from public, anon;
grant execute on function public.is_team_announcement_recipient(uuid) to authenticated;
grant execute on function public.is_team_announcement_author(uuid) to authenticated;
grant execute on function public.post_team_announcement(uuid, uuid, text, boolean, boolean) to authenticated;
grant execute on function public.delete_team_announcement(uuid) to authenticated;
grant execute on function public.mark_team_announcements_read(uuid[]) to authenticated;
grant execute on function public.my_team_announcements(integer) to authenticated;
grant execute on function public.remind_team_event(uuid) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.post_team_announcement(uuid, uuid, text, boolean, boolean)', 'execute')
     or has_function_privilege('anon', 'public.delete_team_announcement(uuid)', 'execute')
     or has_function_privilege('anon', 'public.mark_team_announcements_read(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.my_team_announcements(integer)', 'execute')
     or has_function_privilege('anon', 'public.remind_team_event(uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.create_notification(uuid, text, text, text, text, text)', 'execute')
     or has_table_privilege('anon', 'public.team_announcements', 'select')
     or has_table_privilege('authenticated', 'public.team_announcements', 'insert')
     or has_table_privilege('authenticated', 'public.team_announcement_recipients', 'update') then
    raise exception 'SQL71 privileges are wider than intended';
  end if;
end;
$$;

commit;
