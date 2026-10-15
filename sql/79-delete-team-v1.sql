-- 79-delete-team-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on sql/17 (create_notification), sql/21 (guardian_links), sql/47
-- (coach_attestations, coach_verified_fields), sql/55 and sql/56 (tournament_fixtures),
-- sql/75 (team_staff), sql/78 (teams.kind), and the base payments and match_results
-- tables. Run as postgres.
-- Precheck: sql/79-delete-team-precheck.sql. Postcheck: sql/79-delete-team-postcheck.sql.
-- Rollback: sql/79-delete-team-down.sql.
--
-- Why: a coach could create a team (sql/78) but never remove one, so test teams and
-- mistakes stayed on /team-members, the profile card and /match-plan for good.
--
-- Owner decisions, 15 Oct 2026 (docs/delete-team-v1.md):
--   D1 a team with members may be deleted; its members (accepted or invited), the accepted
--      guardians of those members and its accepted assistant coaches are told.
--   D2 a team is never deleted while it holds a position a coach verified for an athlete
--      (coach_verified_fields): that verification belongs to the athlete and would go with
--      the team (on delete cascade through coach_attestations).
--   D3 the coach types the team's name to confirm; the name is checked here as well.
-- Never deleted, whatever the coach types: a team already submitted to an organizer
-- (status other than draft), a team with a payment, and a team in a match result (void or
-- not), a performance row or a fixture, because those carry athletes' verified history.
--
-- What goes with the team (each already on delete cascade from teams): invitations and
-- members, events, announcements, training plans, coach notes, match minutes, skill
-- proposals (an accepted one stays on the athlete through athlete_skill_assessments),
-- unanswered position attestations, assistant coaches, the match plan. An entry made from
-- a deleted own team keeps going; its source_team_id becomes null (sql/78).

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.team_members') is null
     or to_regclass('public.guardian_links') is null or to_regclass('public.team_staff') is null
     or to_regclass('public.payments') is null or to_regclass('public.match_results') is null
     or to_regclass('public.match_player_performances') is null or to_regclass('public.tournament_fixtures') is null
     or to_regclass('public.coach_attestations') is null or to_regclass('public.coach_verified_fields') is null
     or to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind')
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'tournament_fixtures' and column_name = 'winner_team_id') then
    raise exception 'Prerequisites missing: sql/17, 21, 47, 55, 56, 75, 78, payments, match_results';
  end if;
end;
$$;

-- Indexes so the checks below stay index lookups as teams and results grow. payments
-- (team_id) already has payments_one_payment_per_team_idx (supabase-rls.sql) and
-- coach_attestations (team_id) has coach_attestations_team_idx (sql/47).
create index if not exists match_results_team_a_idx on public.match_results (team_a_id);
create index if not exists match_results_team_b_idx on public.match_results (team_b_id);
create index if not exists match_player_performances_team_idx on public.match_player_performances (team_id);
create index if not exists tournament_fixtures_home_idx on public.tournament_fixtures (home_team_id) where home_team_id is not null;
create index if not exists tournament_fixtures_away_idx on public.tournament_fixtures (away_team_id) where away_team_id is not null;
create index if not exists tournament_fixtures_winner_idx on public.tournament_fixtures (winner_team_id) where winner_team_id is not null;

-- Delete my team. Returns 'deleted', or 'already_gone' when the team no longer exists, so a
-- retried request has the same effect as one.
create or replace function public.delete_my_team(p_team_id uuid, p_confirm_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_team public.teams%rowtype;
  v_athlete uuid;
  v_guardian uuid;
  v_staff uuid;
  v_title text;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_team_id is null then raise exception 'INVALID_TEAM' using errcode = '22023'; end if;

  -- The row lock makes a parallel delete, invite or submit of this team wait for this one.
  select * into v_team from public.teams where id = p_team_id for update;
  if not found then return 'already_gone'; end if;
  if v_team.created_by is distinct from v_user then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_team.status <> 'draft' then raise exception 'TEAM_SUBMITTED' using errcode = '55000'; end if;
  if regexp_replace(trim(coalesce(p_confirm_name, '')), '[[:space:]]+', ' ', 'g')
     <> regexp_replace(trim(v_team.name), '[[:space:]]+', ' ', 'g') then
    raise exception 'TEAM_NAME_MISMATCH' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where team_id = p_team_id) then
    raise exception 'TEAM_HAS_PAYMENT' using errcode = '55000';
  end if;
  if exists (select 1 from public.match_results where team_a_id = p_team_id)
     or exists (select 1 from public.match_results where team_b_id = p_team_id)
     or exists (select 1 from public.match_player_performances where team_id = p_team_id)
     or exists (select 1 from public.tournament_fixtures where home_team_id = p_team_id)
     or exists (select 1 from public.tournament_fixtures where away_team_id = p_team_id)
     or exists (select 1 from public.tournament_fixtures where winner_team_id = p_team_id) then
    raise exception 'TEAM_HAS_RESULTS' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.coach_verified_fields f
    join public.coach_attestations a on a.id = f.attestation_id
    where a.team_id = p_team_id
  ) then
    raise exception 'TEAM_HAS_VERIFIED_FIELDS' using errcode = '55000';
  end if;

  -- D1: tell the people who were on the team before it goes.
  v_title := 'ทีม ' || v_team.name || ' ถูกลบแล้ว';
  for v_athlete in
    select m.athlete_id from public.team_members m where m.team_id = p_team_id and m.status in ('accepted', 'pending')
  loop
    perform public.create_notification(v_athlete, 'team_status', v_title,
      'โค้ชลบทีมนี้แล้ว นัดซ้อม ประกาศ และแผนซ้อมของทีมนี้หายไปด้วย ผลแข่ง การ์ด และประวัติของคุณยังอยู่ครบ',
      '/team-members', 'team_deleted:' || p_team_id::text || ':' || v_athlete::text);
    for v_guardian in
      select g.guardian_id from public.guardian_links g where g.athlete_id = v_athlete and g.status = 'accepted'
    loop
      perform public.create_notification(v_guardian, 'team_status', v_title,
        'โค้ชลบทีมที่ลูกของคุณอยู่ ผลแข่ง การ์ด และประวัติของลูกยังอยู่ครบ',
        '/team-members', 'team_deleted:' || p_team_id::text || ':' || v_athlete::text || ':' || v_guardian::text);
    end loop;
  end loop;
  for v_staff in
    select s.user_id from public.team_staff s where s.team_id = p_team_id and s.status = 'accepted'
  loop
    perform public.create_notification(v_staff, 'team_status', v_title,
      'หัวหน้าโค้ชลบทีมนี้แล้ว คุณไม่ได้เป็นทีมงานของทีมนี้อีกต่อไป',
      '/team-members', 'team_deleted:' || p_team_id::text || ':' || v_staff::text);
  end loop;

  delete from public.teams where id = p_team_id;
  return 'deleted';
end;
$$;

revoke all on function public.delete_my_team(uuid, text) from public, anon;
grant execute on function public.delete_my_team(uuid, text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.delete_my_team(uuid, text)', 'execute') then
    raise exception 'SQL79 privileges are wider than intended';
  end if;
end;
$$;

commit;
