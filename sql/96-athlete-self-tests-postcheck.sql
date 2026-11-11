-- Read-only postcheck for SQL96, same project.
-- Expected: table true; rls true; one_per_day true; record_fn true; delete_fn true;
-- definers 2; auth_calls true; anon_calls false; anon_reads false; auth_writes false; rows 0 on a
-- fresh apply; fingerprint equal on Staging and Production to runbook row 96.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.athlete_self_tests') is not null as table,
       (select relrowsecurity from pg_class where oid = 'public.athlete_self_tests'::regclass) as rls,
       exists (select 1 from pg_constraint
                where conrelid = 'public.athlete_self_tests'::regclass and contype = 'u') as one_per_day,
       to_regprocedure('public.record_my_self_test(text, integer)') is not null as record_fn,
       to_regprocedure('public.delete_my_self_test(text, date)') is not null as delete_fn,
       (select count(1) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('record_my_self_test', 'delete_my_self_test') and p.prosecdef) as definers,
       has_function_privilege('authenticated', 'public.record_my_self_test(text, integer)', 'execute')
         and has_function_privilege('authenticated', 'public.delete_my_self_test(text, date)', 'execute') as auth_calls,
       has_function_privilege('anon', 'public.record_my_self_test(text, integer)', 'execute')
         or has_function_privilege('anon', 'public.delete_my_self_test(text, date)', 'execute') as anon_calls,
       has_table_privilege('anon', 'public.athlete_self_tests', 'select') as anon_reads,
       has_table_privilege('authenticated', 'public.athlete_self_tests', 'insert')
         or has_table_privilege('authenticated', 'public.athlete_self_tests', 'update')
         or has_table_privilege('authenticated', 'public.athlete_self_tests', 'delete') as auth_writes,
       (select count(1) from public.athlete_self_tests) as rows,
       (select left(md5(string_agg(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g'), '' order by p.proname)), 8)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('record_my_self_test', 'delete_my_self_test')) as fingerprint;
