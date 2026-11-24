-- Read-only postcheck for SQL102, the project you are on.
-- Expected on both: trigger_enabled O (fires for every session), guard_definer true,
-- guard_callable_by_users false, confirm_definer true, confirm_anon false, confirm_authenticated
-- true, and the same guard_fp and confirm_fp on Staging and Production.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select tgenabled::text from pg_trigger where tgrelid = 'public.teams'::regclass and tgname = 'team_status_transition_guard') as trigger_enabled,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.enforce_team_status_transition()')) as guard_definer,
       (has_function_privilege('authenticated', 'public.enforce_team_status_transition()', 'execute')
         or has_function_privilege('anon', 'public.enforce_team_status_transition()', 'execute')) as guard_callable_by_users,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.enforce_team_status_transition()')) as guard_fp,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_definer,
       has_function_privilege('anon', 'public.confirm_payment_safely(uuid)', 'execute') as confirm_anon,
       has_function_privilege('authenticated', 'public.confirm_payment_safely(uuid)', 'execute') as confirm_authenticated,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_fp,
       (select count(1) from public.teams) as teams,
       (select count(1) from public.payments) as payments;
