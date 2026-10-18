-- 83-team-join-requests-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/17 (create_notification), sql/18 (team_members), sql/21
-- (guardian_links), sql/47 (manage_coach_beta), sql/78 (teams.kind). Precheck:
-- sql/83-team-join-requests-precheck.sql. Postcheck: sql/83-team-join-requests-postcheck.sql.
-- Rollback: sql/83-team-join-requests-down.sql.
--
-- Why: ADR-011 (owner, 18 Oct 2026). An athlete could only wait for an email invitation,
-- could not leave a team, and a coach removed athletes without a reason. teams.members, the
-- old free-text roster, still held text that may name other children.
-- What:
--   * One join link per own (club) team. It never expires; the coach can make a new one
--     (the old one stops at once) or stop taking requests.
--   * team_join_preview(token): team name, coach display name and province, for anyone with
--     the link (also signed out). Never the roster.
--   * request_to_join_team(token): an athlete asks to join. A pending email invitation is
--     simply accepted. One open request per athlete and team; at most 50 open per team and
--     20 open per athlete; a request no one answers expires after 30 days (checked when read,
--     no scheduled job). The coach and the athlete's accepted guardians are told.
--   * team_join_requests_for(team): the head coach's open requests with display name,
--     position and birth year only. decide_join_request(id, accept): accepting makes the
--     athlete an accepted member at once; the athlete and guardians are told either way.
--   * leave_team(member): the athlete or an accepted guardian leaves an own team. Kept as
--     status 'left'; the athlete may rejoin later.
--   * my_children_team_memberships(): a guardian's children's own-team rows, so the guardian
--     can leave on a child's behalf.
--   * remove_team_member(member, reason, note): the head coach removes an athlete from a team
--     that is not submitted, with a reason from a fixed list ('other' needs a note of 1-200
--     characters). The athlete and guardians see the reason. manage_coach_beta (sql/47),
--     which removed without a reason, is no longer callable by signed-in users.
--   * teams.members is cleared and must stay empty.
-- Writes go through these functions only: no grant on the new tables, RLS on.

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.team_members') is null
     or to_regclass('public.guardian_links') is null or to_regclass('public.athlete_profiles') is null
     or to_regclass('public.profiles') is null
     or to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null
     or to_regprocedure('public.manage_coach_beta(text,uuid,jsonb)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind') then
    raise exception 'Prerequisites missing: sql/17, 18, 21, 47, 78';
  end if;
end;
$$;

-- Membership: a member who leaves is 'left'; a removal keeps its reason.
alter table public.team_members drop constraint if exists team_members_status_check;
alter table public.team_members add constraint team_members_status_check
  check (status in ('pending', 'accepted', 'declined', 'removed', 'left'));
alter table public.team_members add column if not exists removal_reason text;
alter table public.team_members add column if not exists removal_note text;
alter table public.team_members add column if not exists ended_by uuid references auth.users(id) on delete set null;
alter table public.team_members drop constraint if exists team_members_removal_reason_check;
alter table public.team_members add constraint team_members_removal_reason_check
  check (removal_reason is null or removal_reason in ('moved_team', 'asked_to_leave', 'inactive', 'other'));
alter table public.team_members drop constraint if exists team_members_removal_note_check;
alter table public.team_members add constraint team_members_removal_note_check
  check (removal_note is null or char_length(removal_note) between 1 and 200);

-- The free-text roster: cleared, and kept empty.
update public.teams set members = '' where members is distinct from '';
alter table public.teams drop constraint if exists teams_members_cleared_check;
alter table public.teams add constraint teams_members_cleared_check check (members = '');

create table if not exists public.team_join_links (
  team_id uuid primary key references public.teams(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{32}$'),
  open boolean not null default true,
  created_at timestamptz not null default now(),
  rotated_at timestamptz not null default now()
);
alter table public.team_join_links enable row level security;
revoke all on table public.team_join_links from public, anon, authenticated;

create table if not exists public.team_join_requests (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id) on delete set null
);
alter table public.team_join_requests enable row level security;
revoke all on table public.team_join_requests from public, anon, authenticated;
create unique index if not exists team_join_requests_one_open_idx
  on public.team_join_requests (team_id, athlete_id) where status = 'pending';
create index if not exists team_join_requests_team_open_idx
  on public.team_join_requests (team_id, created_at) where status = 'pending';
create index if not exists team_join_requests_athlete_open_idx
  on public.team_join_requests (athlete_id) where status = 'pending';

-- Tell an athlete and their accepted guardians.
create or replace function public.notify_athlete_and_guardians(p_athlete uuid, p_title text, p_body text, p_href text, p_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_guardian uuid;
begin
  perform public.create_notification(p_athlete, 'team_status', p_title, p_body, p_href, p_key || ':' || p_athlete::text);
  for v_guardian in
    select g.guardian_id from public.guardian_links g where g.athlete_id = p_athlete and g.status = 'accepted'
  loop
    perform public.create_notification(v_guardian, 'team_status', p_title, p_body, p_href, p_key || ':' || p_athlete::text || ':' || v_guardian::text);
  end loop;
end;
$$;
revoke all on function public.notify_athlete_and_guardians(uuid, text, text, text, text) from public, anon, authenticated;

-- Requests older than 30 days are expired whenever a team's requests are read or added to.
create or replace function public.expire_team_join_requests(p_team_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.team_join_requests set status = 'expired', decided_at = now()
  where team_id = p_team_id and status = 'pending' and created_at < now() - interval '30 days';
$$;
revoke all on function public.expire_team_join_requests(uuid) from public, anon, authenticated;

-- The head coach's join link for an own team; made on first use.
create or replace function public.my_team_join_link(p_team_id uuid)
returns table (token text, open boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_team from public.teams where id = p_team_id;
  if not found or v_team.created_by is distinct from v_user then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_team.kind is distinct from 'club' then raise exception 'NOT_CLUB_TEAM' using errcode = '22023'; end if;
  insert into public.team_join_links (team_id, token)
  values (p_team_id, replace(gen_random_uuid()::text, '-', ''))
  on conflict (team_id) do nothing;
  return query select l.token, l.open from public.team_join_links l where l.team_id = p_team_id;
end;
$$;

-- A new token (the old link stops at once) and/or open or close the link.
create or replace function public.update_team_join_link(p_team_id uuid, p_rotate boolean, p_open boolean)
returns table (token text, open boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  perform 1 from public.my_team_join_link(p_team_id);
  update public.team_join_links l
  set token = case when coalesce(p_rotate, false) then replace(gen_random_uuid()::text, '-', '') else l.token end,
      rotated_at = case when coalesce(p_rotate, false) then now() else l.rotated_at end,
      open = coalesce(p_open, l.open)
  where l.team_id = p_team_id;
  return query select l.token, l.open from public.team_join_links l where l.team_id = p_team_id;
end;
$$;

-- What anyone with the link sees: never the roster.
create or replace function public.team_join_preview(p_token text)
returns table (team_name text, coach_name text, province text, open boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select t.name, nullif(btrim(p.full_name), ''), nullif(btrim(p.province), ''), l.open
  from public.team_join_links l
  join public.teams t on t.id = l.team_id
  left join public.profiles p on p.id = t.created_by
  where l.token = p_token and p_token ~ '^[0-9a-f]{32}$';
$$;

-- An athlete asks to join. Returns 'requested', 'already_requested', 'joined' (a pending
-- invitation was accepted) or 'already_member'.
create or replace function public.request_to_join_team(p_token text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_link public.team_join_links%rowtype;
  v_team public.teams%rowtype;
  v_member public.team_members%rowtype;
  v_request uuid;
  v_name text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_token is null or p_token !~ '^[0-9a-f]{32}$' then raise exception 'LINK_NOT_FOUND' using errcode = '22023'; end if;
  select * into v_link from public.team_join_links where token = p_token;
  if not found then raise exception 'LINK_NOT_FOUND' using errcode = '22023'; end if;
  -- The team row lock makes requests to one team, the cap and a parallel decision wait in line.
  select * into v_team from public.teams where id = v_link.team_id for update;
  if not v_link.open then raise exception 'LINK_CLOSED' using errcode = '55000'; end if;
  if v_team.created_by = v_user then raise exception 'OWN_TEAM' using errcode = '22023'; end if;
  if v_team.status <> 'draft' then raise exception 'ROSTER_LOCKED' using errcode = '55000'; end if;
  if not exists (select 1 from public.athlete_profiles where user_id = v_user) then
    raise exception 'ATHLETE_PROFILE_REQUIRED' using errcode = '22023';
  end if;

  select * into v_member from public.team_members where team_id = v_team.id and athlete_id = v_user for update;
  if found and v_member.status = 'accepted' then return 'already_member'; end if;
  if found and v_member.status = 'pending' then
    update public.team_members set status = 'accepted', responded_at = now() where id = v_member.id;
    update public.team_join_requests set status = 'accepted', decided_at = now()
    where team_id = v_team.id and athlete_id = v_user and status = 'pending';
    return 'joined';
  end if;

  perform public.expire_team_join_requests(v_team.id);
  if exists (select 1 from public.team_join_requests where team_id = v_team.id and athlete_id = v_user and status = 'pending') then
    return 'already_requested';
  end if;
  if (select count(1) from public.team_join_requests where team_id = v_team.id and status = 'pending') >= 50 then
    raise exception 'TEAM_REQUESTS_FULL' using errcode = '54000';
  end if;
  if (select count(1) from public.team_join_requests r where r.athlete_id = v_user and r.status = 'pending'
      and r.created_at >= now() - interval '30 days') >= 20 then
    raise exception 'TOO_MANY_REQUESTS' using errcode = '54000';
  end if;

  insert into public.team_join_requests (team_id, athlete_id) values (v_team.id, v_user) returning id into v_request;
  select coalesce(nullif(btrim(display_name), ''), 'นักกีฬา') into v_name from public.athlete_profiles where user_id = v_user;
  perform public.create_notification(v_team.created_by, 'team_invite', 'มีคนขอเข้าทีม ' || v_team.name,
    v_name || ' ขอเข้าทีม กดเพื่อรับเข้าทีมหรือไม่รับ', '/team-members/' || v_team.id::text, 'join_request:' || v_request::text);
  -- The athlete's own copy is skipped: they just pressed the button.
  perform public.create_notification(g.guardian_id, 'team_status', v_name || ' ขอเข้าทีม ' || v_team.name,
    'แจ้งให้ทราบว่าลูกของคุณขอเข้าทีมนี้ โค้ชจะเป็นผู้ตัดสินใจรับเข้าทีม', '/team-members',
    'join_request:' || v_request::text || ':' || g.guardian_id::text)
  from public.guardian_links g where g.athlete_id = v_user and g.status = 'accepted';
  return 'requested';
end;
$$;

-- The head coach's open requests: display name, position and birth year only.
create or replace function public.team_join_requests_for(p_team_id uuid)
returns table (request_id uuid, athlete_id uuid, display_name text, athlete_position text, birth_year integer, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if not exists (select 1 from public.teams where id = p_team_id and created_by = v_user) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  perform public.expire_team_join_requests(p_team_id);
  return query
    select r.id, r.athlete_id, a.display_name, a.position, extract(year from a.birth_date)::integer, r.created_at
    from public.team_join_requests r
    join public.athlete_profiles a on a.user_id = r.athlete_id
    where r.team_id = p_team_id and r.status = 'pending'
    order by r.created_at
    limit 50;
end;
$$;

-- Accept or turn down a request. Returns the request's status; a decided request returns
-- its status unchanged, so a double tap has the effect of one.
create or replace function public.decide_join_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_request public.team_join_requests%rowtype;
  v_team public.teams%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_accept is null then raise exception 'INVALID_DECISION' using errcode = '22023'; end if;
  select * into v_request from public.team_join_requests where id = p_request_id;
  if not found then raise exception 'REQUEST_NOT_FOUND' using errcode = '22023'; end if;
  select * into v_team from public.teams where id = v_request.team_id for update;
  if v_team.created_by is distinct from v_user then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  select * into v_request from public.team_join_requests where id = p_request_id for update;
  if v_request.status <> 'pending' then return v_request.status; end if;
  if v_request.created_at < now() - interval '30 days' then
    update public.team_join_requests set status = 'expired', decided_at = now() where id = p_request_id;
    return 'expired';
  end if;

  if p_accept then
    if v_team.status <> 'draft' then raise exception 'ROSTER_LOCKED' using errcode = '55000'; end if;
    if v_team.tournament_id is not null and exists (
      select 1 from public.team_members m join public.teams t on t.id = m.team_id
      where m.athlete_id = v_request.athlete_id and t.tournament_id = v_team.tournament_id
        and t.id <> v_team.id and m.status in ('pending', 'accepted')
    ) then
      raise exception 'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER' using errcode = '23505';
    end if;
    insert into public.team_members (team_id, athlete_id, invited_by, status, invited_at, responded_at)
    values (v_team.id, v_request.athlete_id, v_user, 'accepted', now(), now())
    on conflict (team_id, athlete_id) do update
      set status = 'accepted', invited_by = excluded.invited_by, responded_at = now(),
          removal_reason = null, removal_note = null, ended_by = null;
    update public.team_join_requests set status = 'accepted', decided_at = now(), decided_by = v_user where id = p_request_id;
    perform public.notify_athlete_and_guardians(v_request.athlete_id, 'รับเข้าทีม ' || v_team.name || ' แล้ว',
      'โค้ชรับคำขอเข้าทีมแล้ว นัดซ้อม ประกาศ และแผนซ้อมของทีมอยู่ที่หน้าทีมของฉัน', '/team-members',
      'join_decided:' || p_request_id::text);
    return 'accepted';
  end if;

  update public.team_join_requests set status = 'declined', decided_at = now(), decided_by = v_user where id = p_request_id;
  perform public.notify_athlete_and_guardians(v_request.athlete_id, 'ทีม ' || v_team.name || ' ยังไม่รับคำขอ',
    'โค้ชยังไม่รับคำขอเข้าทีมนี้ ขอเข้าทีมอื่นหรือขอใหม่ภายหลังได้', '/team-members',
    'join_decided:' || p_request_id::text);
  return 'declined';
end;
$$;

-- The athlete, or an accepted guardian, leaves an own team. Returns 'left' (also when
-- already left).
create or replace function public.leave_team(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.team_members%rowtype;
  v_team public.teams%rowtype;
  v_name text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_member from public.team_members where id = p_member_id;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode = '22023'; end if;
  if v_member.athlete_id is distinct from v_user and not exists (
    select 1 from public.guardian_links g where g.athlete_id = v_member.athlete_id and g.guardian_id = v_user and g.status = 'accepted'
  ) then
    raise exception 'NOT_ALLOWED' using errcode = '42501';
  end if;
  select * into v_team from public.teams where id = v_member.team_id for update;
  -- A tournament entry is left through withdraw_from_entry (sql/78), which knows its lock.
  if v_team.kind is distinct from 'club' then raise exception 'NOT_CLUB_TEAM' using errcode = '22023'; end if;
  select * into v_member from public.team_members where id = p_member_id for update;
  if v_member.status = 'left' then return 'left'; end if;
  if v_member.status not in ('pending', 'accepted') then raise exception 'NOT_A_MEMBER' using errcode = '22023'; end if;
  update public.team_members set status = 'left', responded_at = now(), ended_by = v_user,
    removal_reason = null, removal_note = null
  where id = p_member_id;
  if v_member.status = 'accepted' then
    select coalesce(nullif(btrim(display_name), ''), 'นักกีฬา') into v_name from public.athlete_profiles where user_id = v_member.athlete_id;
    perform public.create_notification(v_team.created_by, 'team_status', v_name || ' ออกจากทีม ' || v_team.name,
      case when v_member.athlete_id = v_user then 'นักกีฬาออกจากทีมเอง' else 'ผู้ปกครองให้นักกีฬาออกจากทีม' end,
      '/team-members/' || v_team.id::text, 'team_left:' || p_member_id::text || ':' || extract(epoch from now())::bigint::text);
  end if;
  return 'left';
end;
$$;

-- The head coach removes an athlete from a team that is not submitted, with a reason.
create or replace function public.remove_team_member(p_member_id uuid, p_reason text, p_note text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_member public.team_members%rowtype;
  v_team public.teams%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_reason_text text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_reason is null or p_reason not in ('moved_team', 'asked_to_leave', 'inactive', 'other') then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if p_reason = 'other' and (v_note is null or char_length(v_note) > 200) then raise exception 'NOTE_REQUIRED' using errcode = '22023'; end if;
  if p_reason <> 'other' then v_note := null; end if;
  select * into v_member from public.team_members where id = p_member_id;
  if not found then raise exception 'MEMBER_NOT_FOUND' using errcode = '22023'; end if;
  select * into v_team from public.teams where id = v_member.team_id for update;
  if v_team.created_by is distinct from v_user then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_team.status <> 'draft' then raise exception 'ROSTER_LOCKED' using errcode = '55000'; end if;
  select * into v_member from public.team_members where id = p_member_id for update;
  if v_member.status = 'removed' then return 'removed'; end if;
  if v_member.status not in ('pending', 'accepted') then raise exception 'NOT_A_MEMBER' using errcode = '22023'; end if;
  update public.team_members set status = 'removed', responded_at = now(), ended_by = v_user,
    removal_reason = p_reason, removal_note = v_note
  where id = p_member_id;
  v_reason_text := case p_reason
    when 'moved_team' then 'ย้ายทีม'
    when 'asked_to_leave' then 'ขอออกเอง'
    when 'inactive' then 'ไม่ได้มาซ้อมนาน'
    else 'อื่น ๆ: ' || v_note end;
  perform public.notify_athlete_and_guardians(v_member.athlete_id, 'โค้ชนำออกจากทีม ' || v_team.name,
    'เหตุผล: ' || v_reason_text || ' ผลแข่ง การ์ด และประวัติของคุณยังอยู่ครบ', '/team-members',
    'team_removed:' || p_member_id::text || ':' || extract(epoch from now())::bigint::text);
  return 'removed';
end;
$$;

-- A guardian's view of their children's own-team memberships, to leave on a child's behalf.
-- A guardian cannot read team_members; this returns only accepted children's open rows.
create or replace function public.my_children_team_memberships()
returns table (member_id uuid, athlete_id uuid, athlete_name text, team_name text, status text)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.athlete_id, a.display_name, t.name, m.status
  from public.guardian_links g
  join public.team_members m on m.athlete_id = g.athlete_id and m.status in ('pending', 'accepted')
  join public.teams t on t.id = m.team_id and t.kind = 'club'
  join public.athlete_profiles a on a.user_id = m.athlete_id
  where g.guardian_id = (select auth.uid()) and g.status = 'accepted'
  order by a.display_name, t.name
  limit 100;
$$;

revoke all on function public.my_team_join_link(uuid) from public, anon;
revoke all on function public.update_team_join_link(uuid, boolean, boolean) from public, anon;
revoke all on function public.team_join_preview(text) from public;
revoke all on function public.request_to_join_team(text) from public, anon;
revoke all on function public.team_join_requests_for(uuid) from public, anon;
revoke all on function public.decide_join_request(uuid, boolean) from public, anon;
revoke all on function public.leave_team(uuid) from public, anon;
revoke all on function public.remove_team_member(uuid, text, text) from public, anon;
grant execute on function public.my_team_join_link(uuid) to authenticated;
grant execute on function public.update_team_join_link(uuid, boolean, boolean) to authenticated;
grant execute on function public.team_join_preview(text) to anon, authenticated;
grant execute on function public.request_to_join_team(text) to authenticated;
grant execute on function public.team_join_requests_for(uuid) to authenticated;
grant execute on function public.decide_join_request(uuid, boolean) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.remove_team_member(uuid, text, text) to authenticated;
revoke all on function public.my_children_team_memberships() from public, anon;
grant execute on function public.my_children_team_memberships() to authenticated;

-- A removal without a reason is no longer possible from the app's users.
revoke execute on function public.manage_coach_beta(text, uuid, jsonb) from authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.request_to_join_team(text)', 'execute')
     or has_function_privilege('anon', 'public.decide_join_request(uuid,boolean)', 'execute')
     or has_function_privilege('anon', 'public.remove_team_member(uuid,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_athlete_and_guardians(uuid,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.manage_coach_beta(text,uuid,jsonb)', 'execute')
     or has_table_privilege('authenticated', 'public.team_join_requests', 'select')
     or has_table_privilege('authenticated', 'public.team_join_links', 'select') then
    raise exception 'SQL83 privileges are wider than intended';
  end if;
end;
$$;

commit;
