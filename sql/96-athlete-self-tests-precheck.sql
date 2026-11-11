-- Read-only precheck for SQL96, same project.
-- Expected: deps true; birth_date true; table_exists false; record_fn false; delete_fn false.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.athlete_profiles') is not null
       and to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null
       and to_regprocedure('public.is_admin()') is not null as deps,
       exists (select 1 from information_schema.columns
                where table_schema = 'public' and table_name = 'athlete_profiles'
                  and column_name = 'birth_date' and data_type = 'date') as birth_date,
       to_regclass('public.athlete_self_tests') is not null as table_exists,
       to_regprocedure('public.record_my_self_test(text, integer)') is not null as record_fn,
       to_regprocedure('public.delete_my_self_test(text, date)') is not null as delete_fn;
