-- 84-drop-beta-roster-functions-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on nothing; safe before or after sql/83, and safe where none of
-- these functions exist. Precheck: sql/84-drop-beta-roster-functions-precheck.sql.
-- Postcheck: sql/84-drop-beta-roster-functions-postcheck.sql. Rollback:
-- sql/84-drop-beta-roster-functions-down.sql.
--
-- Why: the SQL83 postcheck on Staging, 18 Oct 2026, listed a second remove_team_member
-- (fingerprint 3f916720). It and five more functions come from sql/24-team-roster-integrity
-- and sql/25-team-discovery of the beta branch codex/player-card-beta (commit 36f7f7c),
-- which never reached main but was applied to Staging. All six are security definer and
-- callable by any signed-in user, and none is used by the app. They write team_members
-- around every ADR-011 rule:
--   * remove_team_member(uuid, text): removes a member of a submitted team, writes no
--     team_member_history and tells no guardian.
--   * request_team_membership(uuid): a request by team id, with no join link, outside the
--     50 per team and 20 per athlete caps.
--   * approve_team_request(uuid), decline_team_request(uuid): decide those rows outside
--     decide_join_request.
--   * list_joinable_teams(): lists confirmed teams of open tournaments to any signed-in
--     user, which ADR-011 rules out (a team is found only through its link).
--   * list_my_team_labels(): replaced by my_team_memberships (sql/82).
-- What: drop the six, without cascade, so anything unexpected that depends on one stops
-- the run instead of being dropped with it. invite_team_member, respond_team_invite and
-- record_match_result_safely share names with main's own functions and are left alone.
-- The beta columns on team_members (direction, accepted_at, removed_at, removed_by,
-- removed_reason) hold data and are left for T03.

begin;

drop function if exists public.remove_team_member(uuid, text);
drop function if exists public.request_team_membership(uuid);
drop function if exists public.approve_team_request(uuid);
drop function if exists public.decline_team_request(uuid);
drop function if exists public.list_joinable_teams();
drop function if exists public.list_my_team_labels();

do $$
begin
  if to_regprocedure('public.remove_team_member(uuid,text)') is not null
     or to_regprocedure('public.request_team_membership(uuid)') is not null
     or to_regprocedure('public.approve_team_request(uuid)') is not null
     or to_regprocedure('public.decline_team_request(uuid)') is not null
     or to_regprocedure('public.list_joinable_teams()') is not null
     or to_regprocedure('public.list_my_team_labels()') is not null then
    raise exception 'SQL84: a beta roster function is still present';
  end if;
end;
$$;

commit;
