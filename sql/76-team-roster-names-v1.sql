-- 76-team-roster-names-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Read the Project ID in Settings > General before
-- each run. Depends on SQL75 (is_team_staff) and athlete_profiles. Run as postgres.
-- Precheck: sql/76-team-roster-names-precheck.sql.
--
-- Why: W1 test findings F2 and F3 (docs/w1-coach-tools-findings.md), 12 Oct 2026.
--
--   * F2: a coach saw every member as "นักกีฬา", even an athlete they invited themselves,
--     because athlete_profiles RLS shows a coach public profiles only, and most young
--     athletes' profiles are private. team_roster_names(teams) gives the team's staff (the
--     head coach and accepted assistants, sql/75) the display name and position of the
--     team's pending and accepted members, and nothing else from the profile. A private
--     profile stays private everywhere else: no birth date, photo, province or stats.
--   * F3: the head coach showed as "ยังไม่ได้ใส่ชื่อ" in the team staff list, because an
--     Email OTP account has no full name and there was nowhere to set one.
--     set_my_display_name(name) sets the caller's own profiles.full_name (2-60 characters,
--     trimmed, no control characters) and nothing else; families see it in the staff list.

begin;

do $$
begin
  if to_regprocedure('public.is_team_staff(uuid)') is null
     or to_regclass('public.athlete_profiles') is null
     or to_regclass('public.team_members') is null then
    raise exception 'Prerequisites missing: SQL75 (is_team_staff), athlete_profiles, team_members';
  end if;
end;
$$;

-- Names and positions of the pending and accepted members of the caller's teams, for
-- the team's staff only. At most 100 teams per call; a team the caller is not staff of
-- returns nothing.
create or replace function public.team_roster_names(p_team_ids uuid[])
returns table (team_id uuid, athlete_id uuid, display_name text, "position" text)
language sql
stable
security definer
set search_path = ''
as $$
  select tm.team_id, tm.athlete_id, nullif(trim(ap.display_name), ''), ap.position
  from public.team_members tm
  join public.athlete_profiles ap on ap.user_id = tm.athlete_id
  where (select auth.uid()) is not null
    and coalesce(cardinality(p_team_ids), 0) between 1 and 100
    and tm.team_id = any(p_team_ids)
    and tm.status in ('pending', 'accepted')
    and public.is_team_staff(tm.team_id);
$$;

-- The caller's own name as families see it in the team staff list.
create or replace function public.set_my_display_name(p_name text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if char_length(v_name) not between 2 and 60 or v_name ~ '[[:cntrl:]]' then
    raise exception 'INVALID_NAME' using errcode = '22023';
  end if;
  update public.profiles set full_name = v_name where id = v_user;
  if not found then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  return v_name;
end;
$$;

revoke all on function public.team_roster_names(uuid[]) from public, anon;
revoke all on function public.set_my_display_name(text) from public, anon;
grant execute on function public.team_roster_names(uuid[]) to authenticated;
grant execute on function public.set_my_display_name(text) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.team_roster_names(uuid[])', 'execute')
     or has_function_privilege('anon', 'public.set_my_display_name(text)', 'execute') then
    raise exception 'SQL76 privileges are wider than intended';
  end if;
end;
$$;

commit;
