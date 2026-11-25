-- Read-only postcheck for SQL105, the project you are on.
-- Expected on both: trigger_enabled O, reject_definer true, reject_callable_by_anon false,
-- reject_callable_by_users true, guard_callable_by_users false, one_per_team_idx false,
-- open_idx_def ending "WHERE (status <> 'rejected'::text)", team_idx true, columns 2,
-- guard_fp, confirm_fp and reject_fp the same on Staging and Production, payments as before.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select tgenabled::text from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'payment_rules_guard') as trigger_enabled,
       (select prosecdef from pg_proc where oid = to_regprocedure('public.reject_payment_safely(uuid,text)')) as reject_definer,
       has_function_privilege('anon', 'public.reject_payment_safely(uuid,text)', 'execute') as reject_callable_by_anon,
       has_function_privilege('authenticated', 'public.reject_payment_safely(uuid,text)', 'execute') as reject_callable_by_users,
       (has_function_privilege('authenticated', 'public.enforce_payment_rules()', 'execute')
         or has_function_privilege('anon', 'public.enforce_payment_rules()', 'execute')) as guard_callable_by_users,
       to_regclass('public.payments_one_payment_per_team_idx') is not null as one_per_team_idx,
       (select indexdef from pg_indexes where schemaname = 'public' and indexname = 'payments_one_open_payment_per_team_idx') as open_idx_def,
       to_regclass('public.payments_team_id_idx') is not null as team_idx,
       (select count(1) from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name in ('rejection_reason', 'rejected_at')) as columns,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.enforce_payment_rules()')) as guard_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.reject_payment_safely(uuid,text)')) as reject_fp,
       (select count(1) from public.payments) as payments;
