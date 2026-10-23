-- Rollback for SQL91, same project, owner approval. The app falls back to its ten separate
-- reads on /profile when the function is missing; nothing else uses it.

begin;
drop function if exists public.my_profile_home(text, text);
commit;
