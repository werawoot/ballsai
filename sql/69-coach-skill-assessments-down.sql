-- 69-coach-skill-assessments-down.sql
-- Rollback of SQL69 only if it must be undone. Removes the proposals table and its two
-- functions. Accepted ratings already written to athlete_skill_assessments stay, as any
-- assessment does. Run as postgres.

begin;

do $$
begin
  if to_regclass('public.coach_skill_assessments') is null then
    raise exception 'SQL69 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop function if exists public.respond_coach_skill_assessment(uuid, text);
drop function if exists public.submit_coach_skill_assessment(uuid, uuid, jsonb);
drop table if exists public.coach_skill_assessments;

commit;
