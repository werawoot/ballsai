-- Read-only postcheck for SQL108, the project you are on.
-- Expected on both: rls true, true; anon_reads false; users_read true; users_update_runs false;
-- functions_signed_out false; functions_users true; delete_definer true; policies 6; index true;
-- delete_fp, add_fp, weeks_fp, goal_fp the same on Staging and Production; runs 0, goals 0.
-- No backslash or asterisk, so it survives copy and paste from chat.
select (select relrowsecurity from pg_class where oid = 'public.run_logs'::regclass) as run_logs_rls,
       (select relrowsecurity from pg_class where oid = 'public.run_goals'::regclass) as run_goals_rls,
       has_table_privilege('anon', 'public.run_logs', 'SELECT') or has_table_privilege('anon', 'public.run_goals', 'SELECT') as anon_reads,
       has_table_privilege('authenticated', 'public.run_logs', 'SELECT') as users_read,
       has_table_privilege('authenticated', 'public.run_logs', 'UPDATE') as users_update_runs,
       has_function_privilege('anon', 'public.add_my_run(uuid,date,integer,integer)', 'EXECUTE') or has_function_privilege('anon', 'public.my_run_weeks(integer)', 'EXECUTE') or has_function_privilege('anon', 'public.set_my_run_goal(text,integer)', 'EXECUTE') as functions_signed_out,
       has_function_privilege('authenticated', 'public.add_my_run(uuid,date,integer,integer)', 'EXECUTE') and has_function_privilege('authenticated', 'public.my_run_weeks(integer)', 'EXECUTE') and has_function_privilege('authenticated', 'public.set_my_run_goal(text,integer)', 'EXECUTE') as functions_users,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.delete_my_athlete_data()')) as delete_definer,
       (select count(1) from pg_policies where schemaname = 'public' and tablename in ('run_logs', 'run_goals')) as policies,
       to_regclass('public.run_logs_user_date_idx') is not null as index,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.delete_my_athlete_data()')) as delete_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.add_my_run(uuid,date,integer,integer)')) as add_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.my_run_weeks(integer)')) as weeks_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.set_my_run_goal(text,integer)')) as goal_fp,
       (select count(1) from public.run_logs) as runs,
       (select count(1) from public.run_goals) as goals;
