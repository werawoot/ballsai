-- Sandbox only for SQL104. Never run on Staging or Production: it creates roles, schemas, tables
-- and rows. In an empty local Postgres 16 or 17 database, run in order:
--   psql -d <db> -f sql/checks/101-sandbox-base.sql
--   psql -d <db> -f sql/101-teams-payments-rls-v1.sql
--   psql -d <db> -f sql/checks/102-sandbox-base.sql
--   psql -d <db> -f sql/102-team-status-rules-v1.sql
--   psql -d <db> -f sql/checks/103-sandbox-base.sql
--   psql -d <db> -f sql/103-payment-confirm-rules-v1.sql
--   psql -d <db> -f sql/checks/104-sandbox-base.sql
--   psql -d <db> -f sql/checks/104-sandbox-test.sql      (before SQL104: 8 of 13 false)
--   psql -d <db> -f sql/104-payment-row-rules-v1.sql
--   psql -d <db> -f sql/checks/104-sandbox-test.sql      (after: 13 of 13 true)
-- Supabase Storage's objects table, the columns SQL104 reads (as on both projects, 24 Nov 2026).
create schema if not exists storage;
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid, owner_id text);
-- Stands in for the Storage API's upload in the sandbox checks (the checks write their slip objects).
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;
-- The PromptPay columns both projects have (the slip route copies the tournament's into the payment).
alter table public.tournaments add column promptpay text;
alter table public.payments add column promptpay text;
update public.tournaments set promptpay = '0812345678' where id = '00000000-0000-4000-8000-0000000000f1';
