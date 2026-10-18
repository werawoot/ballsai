-- Rollback for SQL82, same project, owner approval. The app falls back to its old read
-- (team names hidden from athletes again) when the function is missing.

begin;
drop function if exists public.my_team_memberships(integer);
commit;
