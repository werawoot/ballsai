-- Read-only precheck for SQL64. Check the project ref in the URL first.
-- Production before SQL64: anon true, true, false; authenticated true, true.
-- Staging (SQL50 applied): all anon false already; SQL64 changes nothing there.

select has_function_privilege('anon', 'public.training_self_start_programs()', 'execute') as anon_self_start,
       has_function_privilege('anon', 'public.training_today()', 'execute') as anon_today,
       has_function_privilege('anon', 'public.training_enrollments_limit()', 'execute') as anon_limit,
       has_function_privilege('authenticated', 'public.training_self_start_programs()', 'execute') as auth_self_start,
       has_function_privilege('authenticated', 'public.training_today()', 'execute') as auth_today;
