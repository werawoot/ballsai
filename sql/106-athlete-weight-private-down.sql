-- Rollback of SQL106, either project, as postgres: the weight readable again as before.
begin;
drop function if exists public.athlete_weight_kg(uuid);
grant select (weight_kg) on public.athlete_profiles to anon, authenticated;
commit;
