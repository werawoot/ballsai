-- Read-only postcheck for SQL69, same project.
-- Expected: table_exists true, rls true, anon_select false, auth_insert false,
-- auth_update false, anon_submit false, anon_respond false, auth_submit true,
-- auth_respond true, and both fingerprints equal on Staging and Production (runbook row 69).

select to_regclass('public.coach_skill_assessments') is not null as table_exists,
       (select relrowsecurity from pg_class where oid = 'public.coach_skill_assessments'::regclass) as rls,
       has_table_privilege('anon', 'public.coach_skill_assessments', 'select') as anon_select,
       has_table_privilege('authenticated', 'public.coach_skill_assessments', 'insert') as auth_insert,
       has_table_privilege('authenticated', 'public.coach_skill_assessments', 'update') as auth_update,
       has_function_privilege('anon', 'public.submit_coach_skill_assessment(uuid, uuid, jsonb)', 'execute') as anon_submit,
       has_function_privilege('anon', 'public.respond_coach_skill_assessment(uuid, text)', 'execute') as anon_respond,
       has_function_privilege('authenticated', 'public.submit_coach_skill_assessment(uuid, uuid, jsonb)', 'execute') as auth_submit,
       has_function_privilege('authenticated', 'public.respond_coach_skill_assessment(uuid, text)', 'execute') as auth_respond,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.submit_coach_skill_assessment(uuid, uuid, jsonb)'::regprocedure) as submit_fingerprint,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.respond_coach_skill_assessment(uuid, text)'::regprocedure) as respond_fingerprint;
