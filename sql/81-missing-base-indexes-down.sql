-- Rollback for SQL81, with owner approval. Drop only the indexes that the precheck showed
-- missing in that project before SQL81 (17 Oct 2026: on Production the first four, on Staging
-- the last one); the others came from step 3 or step 20 and must stay. Remove the lines that do
-- not apply before running.

begin;
drop index if exists public.teams_one_registration_per_user_per_tournament_idx;
drop index if exists public.teams_tournament_id_idx;
drop index if exists public.payments_tournament_id_idx;
drop index if exists public.tournaments_organizer_id_idx;
drop index if exists public.teams_tournament_draft_idx;
commit;
