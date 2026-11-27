-- Read-only precheck for SQL108, the project you are on.
-- Expected on both (26 Nov 2026): delete_fp 5957a694 (SQL47's), guardian_fn true, run_logs false,
-- run_goals false, add_fn false.
-- No backslash or asterisk, so it survives copy and paste from chat.
select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.delete_my_athlete_data()')) as delete_fp,
       to_regprocedure('public.is_accepted_guardian_for(uuid)') is not null as guardian_fn,
       to_regclass('public.run_logs') is not null as run_logs,
       to_regclass('public.run_goals') is not null as run_goals,
       to_regprocedure('public.add_my_run(uuid,date,integer,integer)') is not null as add_fn;
