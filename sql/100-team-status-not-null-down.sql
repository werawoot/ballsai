-- Rollback for SQL100 on Staging (vorpnkedpscsqhnrssrl) only, which reopens T67 there.
-- Staging refused a null status before SQL100, so only the created_by rule is dropped and the two
-- status columns stay NOT NULL. For Production use sql/100-team-status-not-null-down-production.sql.

begin;

alter table public.teams alter column created_by drop not null;

commit;
