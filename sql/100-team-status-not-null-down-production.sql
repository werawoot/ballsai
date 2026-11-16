-- Rollback for SQL100 on Production (hivedzrwrrcnjrlirhtv) only, which reopens T67 there.
-- All three columns were nullable on Production before SQL100 (precheck, 16 Nov 2026).
-- For Staging use sql/100-team-status-not-null-down.sql.

begin;

alter table public.teams alter column created_by drop not null;
alter table public.teams alter column status drop not null;
alter table public.tournaments alter column status drop not null;

commit;
