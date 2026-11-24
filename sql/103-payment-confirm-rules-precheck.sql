-- Read-only precheck for SQL103, the project you are on.
-- Expected on both (24 Nov 2026): sql102 true, trigger_exists false, guard_fn_exists false,
-- confirm_fp 6d92550e (SQL102's), payment_updaters "confirm_payment_safely" (the only function that
-- changes a payment; anything else listed must be reviewed against the rules first), payment
-- triggers "payment_team_pending_guard", payments 0, slipless_payments 0.
-- No backslash or asterisk, so it survives copy and paste from chat.

select exists (select 1 from pg_trigger where tgrelid = 'public.teams'::regclass and tgname = 'team_status_transition_guard') as sql102,
       exists (select 1 from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'payment_rules_guard') as trigger_exists,
       to_regprocedure('public.enforce_payment_rules()') is not null as guard_fn_exists,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_fp,
       (select string_agg(p.proname, ' | ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc ~ 'update[[:space:]]+(public[.])?payments[[:space:]]') as payment_updaters,
       (select string_agg(tgname, ' | ' order by tgname) from pg_trigger where tgrelid = 'public.payments'::regclass and not tgisinternal) as payment_triggers,
       (select count(1) from public.payments) as payments,
       (select count(1) from public.payments where nullif(btrim(coalesce(slip_url, '')), '') is null) as slipless_payments;
