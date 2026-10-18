-- 81-missing-base-indexes-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Precheck: sql/81-missing-base-indexes-precheck.sql. Postcheck:
-- sql/81-missing-base-indexes-postcheck.sql. Rollback: sql/81-missing-base-indexes-down.sql.
--
-- Why: a read-only survey on 17 Oct 2026 compared the 120 indexes that the applied files in
-- sql/ create with what each project has (runbook row 81).
--   Production lacks four from step 3 (sql/supabase-rls.sql):
--     teams_one_registration_per_user_per_tournament_idx  one entry per coach per tournament;
--                                                         without it two parallel registrations
--                                                         can both pass the function's check
--     teams_tournament_id_idx, payments_tournament_id_idx, tournaments_organizer_id_idx
--                                                         the organizer dashboard, a tournament's
--                                                         team list and its payments
--   Staging lacks teams_tournament_draft_idx from step 20 (sql/20-tournament-roster-flow-v1.sql).
--   (Both lack the four bds_* indexes of sql/32, which is not approved: not touched here.
--   Production also lacks payments_one_payment_per_team_idx and SQL79's indexes; those come
--   from SQL80 and SQL79 themselves.)
-- What: the same five definitions, under the same names, each "if not exists", so each
-- project gets only what it lacks. Refuses, changing nothing, if a coach already has two
-- entries in one tournament (the unique index could not be built); the precheck counts them.

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.payments') is null or to_regclass('public.tournaments') is null then
    raise exception 'Prerequisites missing: teams, payments, tournaments';
  end if;
  if exists (
    select 1 from public.teams where tournament_id is not null
    group by tournament_id, created_by having count(1) > 1
  ) then
    raise exception 'SQL81: a coach has two teams in one tournament; review them by hand before adding the unique index';
  end if;
end;
$$;

create unique index if not exists teams_one_registration_per_user_per_tournament_idx on public.teams (tournament_id, created_by);
create index if not exists teams_tournament_id_idx on public.teams (tournament_id);
create index if not exists payments_tournament_id_idx on public.payments (tournament_id);
create index if not exists tournaments_organizer_id_idx on public.tournaments (organizer_id);
create index if not exists teams_tournament_draft_idx on public.teams (tournament_id, created_by, created_at desc) where status = 'draft';

commit;
