-- Rollback for SQL80, Production only and only with owner approval. Do not run on Staging:
-- there the index comes from step 3 (sql/supabase-rls.sql), not from SQL80.

begin;
drop index if exists public.payments_one_payment_per_team_idx;
commit;
