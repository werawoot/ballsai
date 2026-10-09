-- Read-only precheck for SQL69. Read the Project ID in Settings > General first.
-- Expected before SQL69 (Staging and Production): prerequisites true, table false,
-- submit_fn false, respond_fn false.

select to_regclass('public.team_members') is not null
         and to_regclass('public.athlete_skill_assessments') is not null
         and to_regclass('public.teams') is not null as prerequisites,
       to_regclass('public.coach_skill_assessments') is not null as table_exists,
       to_regprocedure('public.submit_coach_skill_assessment(uuid, uuid, jsonb)') is not null as submit_fn,
       to_regprocedure('public.respond_coach_skill_assessment(uuid, text)') is not null as respond_fn;
