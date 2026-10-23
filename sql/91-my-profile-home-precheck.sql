-- Read-only precheck for SQL91, same project.
-- Expected: private_fn, memberships_fn, training true; fn_exists false.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.my_athlete_private()') is not null as private_fn,
       to_regprocedure('public.my_team_memberships(integer)') is not null as memberships_fn,
       to_regclass('public.training_enrollments') is not null and to_regclass('public.training_checkins') is not null as training,
       to_regprocedure('public.my_profile_home(text, text)') is not null as fn_exists;
