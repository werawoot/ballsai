-- Read-only postcheck for SQL95, same project.
-- Expected: table true; rls true; one_current_idx true; fn true; definer true;
-- auth_calls true; anon_calls false; anon_reads false; auth_writes false; rows 0 on a fresh
-- apply; fingerprint equal on Staging and Production to runbook row 95.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.athlete_training_goals') is not null as table,
       (select relrowsecurity from pg_class where oid = 'public.athlete_training_goals'::regclass) as rls,
       to_regclass('public.athlete_training_goals_one_current_idx') is not null as one_current_idx,
       to_regprocedure('public.set_my_training_goal(text)') is not null as fn,
       (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'set_my_training_goal') as definer,
       has_function_privilege('authenticated', 'public.set_my_training_goal(text)', 'execute') as auth_calls,
       has_function_privilege('anon', 'public.set_my_training_goal(text)', 'execute') as anon_calls,
       has_table_privilege('anon', 'public.athlete_training_goals', 'select') as anon_reads,
       has_table_privilege('authenticated', 'public.athlete_training_goals', 'insert')
         or has_table_privilege('authenticated', 'public.athlete_training_goals', 'update')
         or has_table_privilege('authenticated', 'public.athlete_training_goals', 'delete') as auth_writes,
       (select count(1) from public.athlete_training_goals) as rows,
       (select left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'set_my_training_goal') as fingerprint;
