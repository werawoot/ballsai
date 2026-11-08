-- Read-only precheck for SQL95, same project.
-- Expected: deps true; table_exists false; fn_exists false.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.athlete_profiles') is not null
       and to_regclass('public.training_enrollments') is not null
       and to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null
       and to_regprocedure('public.is_admin()') is not null as deps,
       to_regclass('public.athlete_training_goals') is not null as table_exists,
       to_regprocedure('public.set_my_training_goal(text)') is not null as fn_exists;
