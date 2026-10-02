-- rollback/63-training-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes
-- sql/63-training-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- This LOSES every athlete's training programmes and check-ins: the two tables are
-- dropped. Nothing else depends on them (match results, XP, ranks and badges are
-- untouched). Export them first if the history matters.

begin;

do $$
begin
  if to_regclass('public.training_enrollments') is null then
    raise exception 'SQL63 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop table public.training_checkins;
drop table public.training_enrollments;
drop function if exists public.training_enrollments_limit();
drop function if exists public.training_self_start_programs();
drop function if exists public.training_today();

commit;
