-- Read-only postcheck for SQL77, same project.
-- Expected: guard true, enabled true, anon_calls false, auth_calls false, and guard_fp
-- equal on Staging and Production to the value in runbook row 77.

select exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_guard_privileged_columns') as guard,
       exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_guard_privileged_columns' and tgenabled = 'O') as enabled,
       has_function_privilege('anon', 'public.profiles_guard_privileged_columns()', 'execute') as anon_calls,
       has_function_privilege('authenticated', 'public.profiles_guard_privileged_columns()', 'execute') as auth_calls,
       (select left(md5(regexp_replace(regexp_replace(prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) from pg_proc where oid = 'public.profiles_guard_privileged_columns()'::regprocedure) as guard_fp;
