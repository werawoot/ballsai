-- 85-team-members-unique-key-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/18 (team_members). Precheck:
-- sql/85-team-members-unique-key-precheck.sql. Postcheck:
-- sql/85-team-members-unique-key-postcheck.sql. Rollback: sql/85-team-members-unique-key-down.sql.
--
-- Why: the SQL84 follow-up on Staging, 18 Oct 2026. sql/24 of the beta branch
-- codex/player-card-beta (commit 36f7f7c, never merged to main) dropped the unique constraint
-- team_members_team_id_athlete_id_key of sql/18 and put a partial unique index
-- (team_members_one_active_period_idx, pending and accepted rows only) in its place, to keep
-- one row per membership period. Main keeps one row per team and athlete and writes history
-- to team_member_history (sql/83). Without the constraint every
-- "on conflict (team_id, athlete_id)" in main fails, among them decide_join_request (sql/83)
-- on accept and invite_team_member (sql/20), and an athlete can hold two rows in one team.
-- What: put the sql/18 constraint back under its own name, then drop the beta partial index
-- (the constraint covers it). Stops, changing nothing, if a team and athlete already have
-- two rows. A table lock keeps a concurrent insert from slipping a duplicate in between.
-- Where the constraint already exists (main as applied), only the beta index is dropped,
-- if present. The beta columns (direction, accepted_at, removed_at, removed_by,
-- removed_reason) are nullable or defaulted and are left for T03.

begin;

lock table public.team_members in share row exclusive mode;

do $$
begin
  if to_regclass('public.team_members') is null then
    raise exception 'Prerequisites missing: sql/18 team_members';
  end if;
  if exists (select 1 from public.team_members group by team_id, athlete_id having count(1) > 1) then
    raise exception 'SQL85: a team and athlete have more than one team_members row; resolve before applying';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.team_members'::regclass and conname = 'team_members_team_id_athlete_id_key') then
    alter table public.team_members
      add constraint team_members_team_id_athlete_id_key unique (team_id, athlete_id);
  end if;
end;
$$;

drop index if exists public.team_members_one_active_period_idx;

do $$
begin
  if not exists (select 1 from pg_constraint c
                 where c.conrelid = 'public.team_members'::regclass
                   and c.conname = 'team_members_team_id_athlete_id_key' and c.contype = 'u')
     or to_regclass('public.team_members_one_active_period_idx') is not null then
    raise exception 'SQL85: team_members is not as intended';
  end if;
end;
$$;

commit;
