-- Rollback for SQL92, same project, owner approval. The app falls back to its ten separate
-- calls on /team-members when the function is missing; nothing else uses it.

begin;
drop function if exists public.my_team_hub();
commit;
