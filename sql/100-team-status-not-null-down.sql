-- Rollback for SQL100, the project you are on. Puts back only what the precheck showed as
-- nullable, which reopens T67.
-- As written it drops only the teams.created_by rule: right for Staging, where the two status
-- columns were already NOT NULL before SQL100 and must stay so.
-- Production (all three were nullable): also run these two lines inside the same transaction.
--   alter table public.teams alter column status drop not null;
--   alter table public.tournaments alter column status drop not null;

begin;

alter table public.teams alter column created_by drop not null;

commit;
