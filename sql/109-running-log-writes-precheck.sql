-- Read-only precheck for SQL109, the project you are on.
-- Expected on both: add_fp 4d6e33e3 (SQL108's), add_definer false, users_insert_runs true.
-- No backslash or asterisk, so it survives copy and paste from chat.
select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.add_my_run(uuid,date,integer,integer)')) as add_fp,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.add_my_run(uuid,date,integer,integer)')) as add_definer,
       has_table_privilege('authenticated', 'public.run_logs', 'INSERT') as users_insert_runs;
