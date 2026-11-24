-- Read-only precheck for SQL104, the project you are on.
-- Expected on both (24 Nov 2026): sql103 true, guard_fp a78d1c14 (SQL103's), confirm_fp d7776012,
-- storage_readable true, payment_updaters "confirm_payment_safely", payments 0,
-- payments_not_matching 0 (a payment that would fail SQL104's insert rule today; existing rows are
-- not checked by SQL104, but any listed here should be reviewed). slips_bucket "slips public=false"
-- on Production; none on Staging (owner's step, runbook section 3), so a slip cannot be uploaded
-- there and SQL104's insert rule cannot pass for anyone but an admin until the bucket exists.
-- No backslash or asterisk, so it survives copy and paste from chat.

select exists (select 1 from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'payment_rules_guard') as sql103,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.enforce_payment_rules()')) as guard_fp,
       (select left(md5(prosrc), 8) from pg_proc where oid = to_regprocedure('public.confirm_payment_safely(uuid)')) as confirm_fp,
       has_table_privilege('postgres', 'storage.objects', 'select') as storage_readable,
       (select id || ' public=' || public from storage.buckets where id = 'slips') as slips_bucket,
       (select string_agg(p.proname, ' | ' order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public' and p.prosrc ~ 'update[[:space:]]+(public[.])?payments[[:space:]]') as payment_updaters,
       (select count(1) from public.payments) as payments,
       (select count(1) from public.payments p left join public.tournaments tr on tr.id = p.tournament_id
          where split_part(coalesce(p.slip_url, ''), '_', 1) is distinct from p.user_id::text
             or not exists (select 1 from storage.objects o where o.bucket_id = 'slips' and o.name = p.slip_url)
             or p.amount is distinct from coalesce(tr.fee, 0)
             or coalesce(p.promptpay, '') is distinct from coalesce(tr.promptpay, '')) as payments_not_matching;
