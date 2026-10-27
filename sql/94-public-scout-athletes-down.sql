-- Rollback for SQL94, same project, owner approval only. Nothing is stored by SQL94, so
-- nothing is lost. Without the function /scout pages the /athletes directory newest first
-- (name, province and position filters still work; rating order and the minimum rating do not).

begin;
drop function if exists public.public_scout_athletes(text, text, text, text, text, integer, integer, integer);
commit;
