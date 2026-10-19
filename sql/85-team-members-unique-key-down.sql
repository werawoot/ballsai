-- Rollback for SQL85, same project, owner approval. Only on a project whose precheck showed
-- unique_key false (Staging, 18 Oct 2026): this puts back the beta shape, after which
-- decide_join_request (sql/83) fails on accept again. Never on a project that had the
-- constraint before SQL85 (main as applied).

begin;
create unique index if not exists team_members_one_active_period_idx
  on public.team_members (team_id, athlete_id)
  where status in ('pending', 'accepted');
alter table public.team_members drop constraint if exists team_members_team_id_athlete_id_key;
commit;
