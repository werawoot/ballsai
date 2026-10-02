-- Read-only postcheck for SQL63. Run after applying, on the same project.

select c.relname, c.relrowsecurity as rls_on,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies,
       has_table_privilege('anon', c.oid, 'select') as anon_can_read
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('training_enrollments', 'training_checkins')
order by c.relname;
-- Expected: training_checkins true 3 false; training_enrollments true 4 false.

select has_column_privilege('authenticated', 'public.training_enrollments', 'program_id', 'update') as can_change_programme,
       has_column_privilege('authenticated', 'public.training_enrollments', 'athlete_id', 'update') as can_change_owner,
       has_column_privilege('authenticated', 'public.training_enrollments', 'weekdays', 'update') as can_change_days,
       public.training_self_start_programs() as self_start_programs,
       public.training_today() as thailand_today;
-- Expected: false, false, true, the four solo programmes (no u16-hip-groin-01), today in Thailand.

-- Then in the app (Staging): sign in as an athlete, /training → pick a programme → choose
-- days → "Start today's session" → no pain → tick the drills → "Done". The progress card
-- on /profile shows 1 session. Pressing "Done" again does not add a second one.
