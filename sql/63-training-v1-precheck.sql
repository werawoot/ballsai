-- Read-only precheck for SQL63. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.

select to_regclass('public.athlete_profiles') is not null as athlete_profiles_present,
       to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null as guardian_helper_present,
       to_regprocedure('public.is_admin()') is not null as admin_helper_present,
       to_regclass('public.training_enrollments') is null as enrollments_name_free,
       to_regclass('public.training_checkins') is null as checkins_name_free;
-- Expected: true, true, true, true, true.
