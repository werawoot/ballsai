-- Read-only postcheck for SQL64, same project.
-- Expected: false, false, false, true, true. Then run the SQL63 fingerprint again: all
-- nine values must equal Staging's (docs/apply-round-2026-09.md, step 23).

select has_function_privilege('anon', 'public.training_self_start_programs()', 'execute') as anon_self_start,
       has_function_privilege('anon', 'public.training_today()', 'execute') as anon_today,
       has_function_privilege('anon', 'public.training_enrollments_limit()', 'execute') as anon_limit,
       has_function_privilege('authenticated', 'public.training_self_start_programs()', 'execute') as auth_self_start,
       has_function_privilege('authenticated', 'public.training_today()', 'execute') as auth_today;
