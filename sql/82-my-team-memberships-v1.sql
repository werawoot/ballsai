-- 82-my-team-memberships-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/18 (team_members, team_members_athlete_status_idx) and
-- sql/78 (teams.kind). Precheck: sql/82-my-team-memberships-precheck.sql. Postcheck:
-- sql/82-my-team-memberships-postcheck.sql. Rollback: sql/82-my-team-memberships-down.sql.
--
-- Why: QA on Production, 18 Oct 2026. An athlete who accepted a coach's invitation saw
-- "ทีมของคุณ" instead of the team's name on /team-members and on the profile, and the
-- Career Passport never listed a confirmed team. The pages read team_members with an embedded
-- teams row, and the teams policy (supabase-rls.sql) lets only the team's creator, the
-- tournament organizer and an admin read a team, so the embed came back empty.
-- What: one function that returns the caller's own team_members rows with the few team
-- fields an athlete is entitled to see: the team's name, status and kind, and the
-- tournament's name and place (tournaments are public listings). The teams policy is not
-- widened: a teams row also carries the coach's free-text roster (teams.members), which
-- names other children and is not for a teammate to read.
-- Scale: the rows come from team_members_athlete_status_idx (athlete_id first) and each
-- team and tournament by primary key; p_limit is capped at 100.

begin;

do $$
begin
  if to_regclass('public.team_members') is null or to_regclass('public.teams') is null
     or to_regclass('public.tournaments') is null
     or not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind') then
    raise exception 'Prerequisites missing: sql/18 team_members, sql/78 teams.kind';
  end if;
end;
$$;

create or replace function public.my_team_memberships(p_limit integer default 50)
returns table (
  member_id uuid,
  team_id uuid,
  status text,
  invited_at timestamptz,
  created_at timestamptz,
  team_name text,
  team_status text,
  team_kind text,
  tournament_name text,
  tournament_location text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.team_id, m.status, m.invited_at, m.created_at,
         t.name, t.status, t.kind, tr.name, tr.location
  from public.team_members m
  join public.teams t on t.id = m.team_id
  left join public.tournaments tr on tr.id = t.tournament_id
  where m.athlete_id = (select auth.uid())
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 50), 1), 100);
$$;

revoke all on function public.my_team_memberships(integer) from public, anon;
grant execute on function public.my_team_memberships(integer) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.my_team_memberships(integer)', 'execute') then
    raise exception 'SQL82 privileges are wider than intended';
  end if;
end;
$$;

commit;
