-- Read-only precheck for SQL105, the project you are on.
-- Expected on both (25 Nov 2026): sql104 true (guard_fp d48a1832), confirm_fp d7776012,
-- reject_fn false, columns_present false, one_per_team_idx true, open_idx false,
-- other_statuses 0, payments 0.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.enforce_payment_rules()')) = 'd48a1832' as sql104,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.enforce_payment_rules()')) as guard_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_fp,
       to_regprocedure('public.reject_payment_safely(uuid,text)') is not null as reject_fn,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'payments' and column_name in ('rejection_reason', 'rejected_at')) as columns_present,
       to_regclass('public.payments_one_payment_per_team_idx') is not null as one_per_team_idx,
       to_regclass('public.payments_one_open_payment_per_team_idx') is not null as open_idx,
       (select count(1) from public.payments where status not in ('pending', 'confirmed', 'rejected')) as other_statuses,
       (select count(1) from public.payments) as payments;
