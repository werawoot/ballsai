-- rollback/57-public-fixtures-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes
-- sql/57-public-fixtures-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- Drops the public reader, the publish switch and tournaments.fixtures_published_at.
-- LOSES which tournaments were published: the precheck below prints them; record the
-- list before running, so publishing can be redone after SQL57 is re-applied. Draws,
-- fixtures and results are untouched. Afterwards /tournaments/<id>/fixtures says fixtures
-- are not available, and the organizer's publish switch answers that SQL57 is pending.
--
-- Precheck (read-only, run first and keep the output):
--   select id, name, fixtures_published_at from public.tournaments
--   where fixtures_published_at is not null order by fixtures_published_at;

begin;

do $$
begin
  if to_regprocedure('public.public_tournament_fixtures(uuid)') is null then
    raise exception 'SQL57 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop function public.public_tournament_fixtures(uuid);
drop function public.set_fixtures_published_safely(uuid, boolean);
alter table public.tournaments drop column fixtures_published_at;

do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public'
             and table_name = 'tournaments' and column_name = 'fixtures_published_at') then
    raise exception 'SQL57 rollback left fixtures_published_at behind';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
