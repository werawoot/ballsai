-- 89-organizer-requests-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on supabase-rls (profiles, tournaments, is_admin, is_organizer and
-- the three tournament policies), sql/17 (notifications, create_notification), sql/18
-- (team_members), sql/21 (guardian_links), sql/77 (profiles_guard_privileged_columns: only an
-- admin changes profiles.role), sql/86 and sql/88 (notification type list,
-- notify_athlete_family). Precheck: sql/89-organizer-requests-precheck.sql. Postcheck:
-- sql/89-organizer-requests-postcheck.sql. Rollback: sql/89-organizer-requests-down.sql.
--
-- Why (T53, ADR-013, owner "ยืนยัน ADR-013", 20 Oct 2026): an admin makes every organizer by
-- hand in the SQL Editor, a manual step that grows with every organizer nationwide.
-- What:
--   * organizer_requests: one pending request per account (unique partial index); a new
--     request 7 days after a decline or a revocation. The applicant reads their own rows,
--     admins read all; nobody writes the table directly, only the functions below.
--   * request_organizer_access(): files the request and tells every admin.
--   * decide_organizer_request(): admin only, the request row locked FOR UPDATE, so the first
--     decision wins and a second one gets ALREADY_DECIDED. Approval sets role 'organizer'
--     (never 'admin'); a decline needs a reason. The applicant is told either way.
--   * revoke_organizer_access(): admin only, with a reason. Role back to 'user'; the
--     organizer's open tournaments close to registration; teams and results stay. Team
--     owners, accepted members and those members' accepted guardians are told.
--   * Tournament status 'draft'. A draft is seen only by its organizer and admins (RLS). An
--     applicant with a pending request may create up to 3 drafts; an organizer has no limit.
--     Opening a tournament, or creating one that is not a draft, needs the organizer role;
--     a tournament never goes back to draft; only an admin moves one to another organizer.
--     record_match_result_safely and confirm_payment_safely already refuse a non-organizer,
--     and team registration already needs status 'open'.
--   * public_tournament_organizers(): "จัดโดย <organization> (<province>)" for tournaments that
--     are not drafts; phone and note stay admin-only.
-- Concurrency: the request takes a per-user advisory lock; a draft insert by an applicant
-- takes the same lock before counting; decide and revoke lock the rows they change.
-- Scale: the admin queue reads organizer_requests_pending_idx; admins and organizers are
-- found through profiles_role_admin_summary_idx (sql/34); a revoke touches only that
-- organizer's tournaments (tournaments_organizer_id_idx, sql/81) and their teams. Every
-- notification has a source_key, so a retried call never notifies twice.

begin;

do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.tournaments') is null
     or to_regclass('public.teams') is null or to_regclass('public.team_members') is null
     or to_regclass('public.guardian_links') is null or to_regclass('public.notifications') is null
     or to_regprocedure('public.is_admin()') is null or to_regprocedure('public.is_organizer()') is null
     or to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null
     or to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text,text,text)') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
                    and tgname = 'profiles_guard_privileged_columns') then
    raise exception 'SQL89 needs supabase-rls, sql/17, sql/18, sql/21, sql/77, sql/86 and sql/88 applied first';
  end if;
end;
$$;

-- Requests ------------------------------------------------------------------------------

create table if not exists public.organizer_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_name text not null check (char_length(org_name) between 2 and 120),
  org_type text not null check (org_type in ('school', 'association', 'club', 'independent')),
  province text not null check (char_length(province) between 2 and 60),
  phone text not null check (phone ~ '^[+]?[0-9]{9,15}$'),
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending', 'approved', 'declined', 'revoked')),
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  decision_reason text check (decision_reason is null or char_length(decision_reason) <= 500),
  created_at timestamptz not null default now(),
  constraint organizer_requests_decline_reason check (
    status <> 'declined' or char_length(btrim(coalesce(decision_reason, ''))) >= 3
  ),
  constraint organizer_requests_decided check (status = 'pending' or decided_at is not null)
);

create unique index if not exists organizer_requests_one_pending_idx
  on public.organizer_requests (user_id) where status = 'pending';
create index if not exists organizer_requests_pending_idx
  on public.organizer_requests (created_at, id) where status = 'pending';
create index if not exists organizer_requests_user_idx
  on public.organizer_requests (user_id, created_at desc);

create table if not exists public.organizer_revocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  revoked_by uuid references auth.users(id) on delete set null,
  closed_tournaments integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists organizer_revocations_user_idx
  on public.organizer_revocations (user_id, created_at desc);

alter table public.organizer_requests enable row level security;
alter table public.organizer_revocations enable row level security;
revoke all on public.organizer_requests, public.organizer_revocations from public, anon, authenticated;
grant select on public.organizer_requests, public.organizer_revocations to authenticated;

drop policy if exists organizer_requests_select_own_or_admin on public.organizer_requests;
create policy organizer_requests_select_own_or_admin on public.organizer_requests
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists organizer_revocations_select_own_or_admin on public.organizer_revocations;
create policy organizer_revocations_select_own_or_admin on public.organizer_revocations
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- Notification types --------------------------------------------------------------------

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking',
    'team_announcement', 'team_event_reminder', 'team_training_plan', 'hall_of_fame',
    'organizer_request', 'organizer_decision', 'tournament_closed'
  ));

-- Tournament status 'draft' -------------------------------------------------------------

do $$
declare
  v_name text;
begin
  for v_name in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.tournaments'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  loop
    execute format('alter table public.tournaments drop constraint %I', v_name);
  end loop;
end;
$$;
alter table public.tournaments add constraint tournaments_status_check
  check (status in ('draft', 'open', 'closed'));

create or replace function public.tournaments_guard_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_drafts integer;
begin
  -- The SQL Editor, server jobs and admins.
  if v_user is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is distinct from 'draft' then
      if not public.is_organizer() then
        raise exception 'ORGANIZER_REQUIRED' using errcode = '42501';
      end if;
      return new;
    end if;
    if public.is_organizer() then
      return new;
    end if;
    perform pg_advisory_xact_lock(hashtextextended('organizer_access:' || v_user::text, 0));
    if not exists (select 1 from public.organizer_requests r
                   where r.user_id = v_user and r.status = 'pending') then
      raise exception 'ORGANIZER_REQUEST_REQUIRED' using errcode = '42501';
    end if;
    select count(1) into v_drafts from public.tournaments t
    where t.organizer_id = v_user and t.status = 'draft';
    if v_drafts >= 3 then
      raise exception 'DRAFT_LIMIT' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.organizer_id is distinct from old.organizer_id then
    raise exception 'ORGANIZER_CHANGE_NOT_ALLOWED' using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    if new.status = 'draft' then
      raise exception 'CANNOT_RETURN_TO_DRAFT' using errcode = 'P0001';
    end if;
    if not public.is_organizer() then
      raise exception 'ORGANIZER_REQUIRED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.tournaments_guard_organizer() from public, anon, authenticated;

drop trigger if exists tournaments_guard_organizer on public.tournaments;
create trigger tournaments_guard_organizer
before insert or update of status, organizer_id on public.tournaments
for each row execute function public.tournaments_guard_organizer();

drop policy if exists "tournaments_select_public" on public.tournaments;
create policy "tournaments_select_public"
on public.tournaments
for select
to anon, authenticated
using (
  status <> 'draft'
  or organizer_id = (select auth.uid())
  or (select public.is_admin())
);

drop policy if exists "tournaments_insert_organizer" on public.tournaments;
create policy "tournaments_insert_organizer"
on public.tournaments
for insert
to authenticated
with check (
  organizer_id = (select auth.uid())
  and (status = 'draft' or (select public.is_organizer()))
);

-- Request -------------------------------------------------------------------------------

create or replace function public.request_organizer_access(
  p_org_name text, p_org_type text, p_province text, p_phone text, p_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  v_name text := btrim(coalesce(p_org_name, ''));
  v_province text := btrim(coalesce(p_province, ''));
  v_last timestamptz;
  v_id uuid;
  v_admin uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  select p.role into v_role from public.profiles p where p.id = v_user;
  if v_role in ('organizer', 'admin') then
    raise exception 'ALREADY_ORGANIZER' using errcode = 'P0001';
  end if;
  if char_length(v_name) not between 2 and 120
     or p_org_type is null or p_org_type not in ('school', 'association', 'club', 'independent')
     or char_length(v_province) not between 2 and 60
     or v_phone !~ '^[+]?[0-9]{9,15}$'
     or char_length(coalesce(p_note, '')) > 500 then
    raise exception 'INVALID_REQUEST' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('organizer_access:' || v_user::text, 0));

  if exists (select 1 from public.organizer_requests r where r.user_id = v_user and r.status = 'pending') then
    raise exception 'REQUEST_PENDING' using errcode = 'P0001';
  end if;
  select greatest(
    (select max(r.decided_at) from public.organizer_requests r where r.user_id = v_user and r.status = 'declined'),
    (select max(v.created_at) from public.organizer_revocations v where v.user_id = v_user)
  ) into v_last;
  if v_last is not null and v_last > now() - interval '7 days' then
    raise exception 'REQUEST_TOO_SOON' using errcode = 'P0001',
      detail = to_char((v_last + interval '7 days') at time zone 'Asia/Bangkok', 'YYYY-MM-DD"T"HH24:MI');
  end if;

  insert into public.organizer_requests (user_id, org_name, org_type, province, phone, note)
  values (v_user, v_name, p_org_type, v_province, v_phone, btrim(coalesce(p_note, '')))
  returning id into v_id;

  for v_admin in select p.id from public.profiles p where p.role = 'admin' loop
    perform public.create_notification(v_admin, 'organizer_request', 'คำขอเป็นผู้จัดการแข่งใหม่',
      left(v_name || ' (' || v_province || ') ขอเป็นผู้จัดการแข่ง รอคุณตรวจ', 500), '/admin/organizers',
      'organizer_request:' || v_id::text || ':' || v_admin::text);
  end loop;

  return v_id;
end;
$$;
revoke all on function public.request_organizer_access(text, text, text, text, text) from public, anon;
grant execute on function public.request_organizer_access(text, text, text, text, text) to authenticated;

-- Decide --------------------------------------------------------------------------------

create or replace function public.decide_organizer_request(p_request_id uuid, p_approve boolean, p_reason text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_request public.organizer_requests%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if p_approve is null then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;
  if not p_approve and (v_reason is null or char_length(v_reason) < 3) then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;
  if char_length(coalesce(v_reason, '')) > 500 then
    raise exception 'INVALID_DECISION' using errcode = '22023';
  end if;

  select * into v_request from public.organizer_requests r where r.id = p_request_id for update;
  if not found then
    raise exception 'REQUEST_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_request.status <> 'pending' then
    raise exception 'ALREADY_DECIDED' using errcode = 'P0001', detail = v_request.status;
  end if;

  update public.organizer_requests
  set status = case when p_approve then 'approved' else 'declined' end,
      decided_by = v_user, decided_at = now(), decision_reason = v_reason
  where id = v_request.id;

  if p_approve then
    update public.profiles set role = 'organizer'
    where id = v_request.user_id and role is distinct from 'admin' and role is distinct from 'organizer';
    perform public.create_notification(v_request.user_id, 'organizer_decision',
      'คำขอเป็นผู้จัดการแข่งได้รับอนุมัติแล้ว',
      'ตอนนี้คุณเปิดรับสมัครรายการแข่ง ยืนยันสลิป และบันทึกผลการแข่งได้แล้ว รายการร่างของคุณยังเป็นร่างจนกว่าคุณจะกด "เปิดรับสมัคร"',
      '/dashboard', 'organizer_decision:' || v_request.id::text);
    return 'approved';
  end if;

  perform public.create_notification(v_request.user_id, 'organizer_decision',
    'คำขอเป็นผู้จัดการแข่งยังไม่ผ่าน',
    left('เหตุผล: ' || v_reason || ' · ส่งคำขอใหม่ได้ตั้งแต่ '
      || to_char((now() + interval '7 days') at time zone 'Asia/Bangkok', 'DD/MM/YYYY'), 500),
    '/organizer-request', 'organizer_decision:' || v_request.id::text);
  return 'declined';
end;
$$;
revoke all on function public.decide_organizer_request(uuid, boolean, text) from public, anon;
grant execute on function public.decide_organizer_request(uuid, boolean, text) to authenticated;

-- Revoke --------------------------------------------------------------------------------

create or replace function public.revoke_organizer_access(p_user_id uuid, p_reason text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_reason text := btrim(coalesce(p_reason, ''));
  v_role text;
  v_revocation uuid;
  v_closed integer := 0;
  v_tournament record;
  v_owner uuid;
  v_athlete uuid;
  v_key text;
  v_title text;
  v_body text := 'รายการนี้ปิดรับสมัครแล้ว ทีมที่สมัครไว้และผลการแข่งที่บันทึกแล้วยังอยู่ครบ';
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if char_length(v_reason) not between 3 and 500 then
    raise exception 'REASON_REQUIRED' using errcode = '22023';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_user_id for update;
  if not found or v_role is distinct from 'organizer' then
    raise exception 'NOT_ORGANIZER' using errcode = 'P0001';
  end if;

  update public.profiles set role = 'user' where id = p_user_id;
  update public.organizer_requests
  set status = 'revoked', decision_reason = v_reason
  where user_id = p_user_id and status = 'approved';

  insert into public.organizer_revocations (user_id, reason, revoked_by)
  values (p_user_id, v_reason, v_user)
  returning id into v_revocation;

  for v_tournament in
    update public.tournaments set status = 'closed'
    where organizer_id = p_user_id and status = 'open'
    returning id, name
  loop
    v_closed := v_closed + 1;
    v_key := 'tournament_closed:' || v_revocation::text || ':' || v_tournament.id::text;
    v_title := left('ปิดรับสมัคร: ' || coalesce(nullif(btrim(v_tournament.name), ''), 'รายการแข่ง'), 160);
    -- Team owners and athletes share one key shape, so a person who is both is told once.
    for v_owner in
      select distinct t.created_by from public.teams t
      where t.tournament_id = v_tournament.id and t.created_by is not null
    loop
      perform public.create_notification(v_owner, 'tournament_closed', v_title, v_body,
        '/tournaments/' || v_tournament.id::text, v_key || ':' || v_owner::text);
    end loop;
    for v_athlete in
      select distinct m.athlete_id from public.team_members m
      join public.teams t on t.id = m.team_id
      where t.tournament_id = v_tournament.id and m.status = 'accepted'
    loop
      perform public.notify_athlete_family(v_athlete, 'tournament_closed', v_title, v_body,
        '/tournaments/' || v_tournament.id::text, v_key, v_body, '/tournaments/' || v_tournament.id::text);
    end loop;
  end loop;

  update public.organizer_revocations set closed_tournaments = v_closed where id = v_revocation;

  perform public.create_notification(p_user_id, 'organizer_decision', 'สิทธิ์ผู้จัดการแข่งของคุณถูกยกเลิก',
    left('เหตุผล: ' || v_reason || ' · รายการที่เปิดรับสมัครอยู่ ' || v_closed || ' รายการปิดรับสมัครแล้ว ทีมและผลการแข่งยังอยู่ครบ', 500),
    '/organizer-request', 'organizer_revoked:' || v_revocation::text);

  return v_closed;
end;
$$;
revoke all on function public.revoke_organizer_access(uuid, text) from public, anon;
grant execute on function public.revoke_organizer_access(uuid, text) to authenticated;

-- Public "organized by" ----------------------------------------------------------------

create or replace function public.public_tournament_organizers(p_tournament_ids uuid[])
returns table (tournament_id uuid, org_name text, province text)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, r.org_name, r.province
  from (select distinct u.id from unnest(p_tournament_ids[1:100]) as u(id)) ids
  join public.tournaments t on t.id = ids.id and t.status <> 'draft'
  cross join lateral (
    select q.org_name, q.province from public.organizer_requests q
    where q.user_id = t.organizer_id and q.status = 'approved'
    order by q.created_at desc
    limit 1
  ) r;
$$;
revoke all on function public.public_tournament_organizers(uuid[]) from public;
grant execute on function public.public_tournament_organizers(uuid[]) to anon, authenticated;

-- Self-check ----------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.tournaments'::regclass
                 and tgname = 'tournaments_guard_organizer' and tgenabled = 'O')
     or not exists (select 1 from pg_constraint where conrelid = 'public.tournaments'::regclass
                    and conname = 'tournaments_status_check')
     or not (select relrowsecurity from pg_class where oid = 'public.organizer_requests'::regclass)
     or has_table_privilege('authenticated', 'public.organizer_requests', 'insert')
     or has_function_privilege('anon', 'public.request_organizer_access(text,text,text,text,text)', 'execute')
     or not has_function_privilege('anon', 'public.public_tournament_organizers(uuid[])', 'execute') then
    raise exception 'SQL89 self-check failed';
  end if;
end;
$$;

commit;
