-- Rollback for SQL94, same project, owner approval only. Nothing is stored by SQL94, so
-- nothing is lost. Without the function /scout says it is not ready and lists no one;
-- roll the app back first if the old 150-profile list is wanted meanwhile.

begin;
drop function if exists public.public_scout_athletes(text, text, text, text, text, integer, integer, integer);
commit;
