-- Read-only postcheck for SQL109, the project you are on.
-- Expected on both: add_definer true, users_insert_runs false, users_delete_runs true,
-- add_callable_signed_out false, add_callable_by_users true, add_fp the same on Staging and Production.
-- No backslash or asterisk, so it survives copy and paste from chat.
select (select prosecdef from pg_proc where oid = to_regprocedure('public.add_my_run(uuid,date,integer,integer)')) as add_definer,
       has_table_privilege('authenticated', 'public.run_logs', 'INSERT') as users_insert_runs,
       has_table_privilege('authenticated', 'public.run_logs', 'DELETE') as users_delete_runs,
       has_function_privilege('anon', 'public.add_my_run(uuid,date,integer,integer)', 'EXECUTE') as add_callable_signed_out,
       has_function_privilege('authenticated', 'public.add_my_run(uuid,date,integer,integer)', 'EXECUTE') as add_callable_by_users,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.add_my_run(uuid,date,integer,integer)')) as add_fp;
