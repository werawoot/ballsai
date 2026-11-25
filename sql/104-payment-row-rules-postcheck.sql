-- Read-only postcheck for SQL104, the project you are on.
-- Expected on both: trigger_enabled O, guard_definer true, guard_callable_by_users false, guard_fp
-- the same on Staging and Production, confirm_fp d7776012 (unchanged), payments as before.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select tgenabled::text from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'payment_rules_guard') as trigger_enabled,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.enforce_payment_rules()')) as guard_definer,
       (has_function_privilege('authenticated', 'public.enforce_payment_rules()', 'execute')
         or has_function_privilege('anon', 'public.enforce_payment_rules()', 'execute')) as guard_callable_by_users,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.enforce_payment_rules()')) as guard_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_fp,
       (select count(1) from public.payments) as payments;
