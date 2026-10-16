-- Read-only postcheck for SQL80, same project.
-- Expected: unique_index true, is_unique true, on_team_id true; payments equal to the precheck.

select to_regclass('public.payments_one_payment_per_team_idx') is not null as unique_index,
       coalesce((select i.indisunique from pg_index i where i.indexrelid = to_regclass('public.payments_one_payment_per_team_idx')), false) as is_unique,
       coalesce((select pg_get_indexdef(to_regclass('public.payments_one_payment_per_team_idx')) like '%(team_id)%'), false) as on_team_id,
       (select count(1) from public.payments) as payments;
