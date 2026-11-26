-- Sandbox only for SQL105. Never run on Staging or Production: it creates rows. In an empty local
-- Postgres 16 or 17 database, run the SQL104 chain (sql/checks/104-sandbox-base.sql lists it, then
-- sql/104-payment-row-rules-v1.sql), then:
--   psql -d <db> -f sql/checks/105-sandbox-base.sql
--   psql -d <db> -f sql/checks/105-sandbox-test.sql      (before SQL105: 4 of 13 not true)
--   psql -d <db> -f sql/105-payment-reject-resend-v1.sql
--   psql -d <db> -f sql/checks/105-sandbox-test.sql      (after: 13 of 13 true)
-- A second organizer, of another tournament, for the "not your tournament" check.
insert into public.profiles values ('00000000-0000-4000-8000-0000000000a2', 'organizer');
-- The unique index both projects have (sql/80, sql/supabase-rls.sql); the sandbox base of 101 has none.
create unique index if not exists payments_one_payment_per_team_idx on public.payments (team_id);
