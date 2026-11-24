-- Sandbox only for SQL103. Never run on Staging or Production: it creates roles, schemas, tables
-- and rows. In an empty local Postgres 16 or 17 database, run in order:
--   psql -d <db> -f sql/checks/101-sandbox-base.sql
--   psql -d <db> -f sql/101-teams-payments-rls-v1.sql
--   psql -d <db> -f sql/checks/102-sandbox-base.sql
--   psql -d <db> -f sql/102-team-status-rules-v1.sql
--   psql -d <db> -f sql/checks/103-sandbox-base.sql
--   psql -d <db> -f sql/checks/103-sandbox-test.sql      (before SQL103: 7 of 11 false)
--   psql -d <db> -f sql/103-payment-confirm-rules-v1.sql
--   psql -d <db> -f sql/checks/103-sandbox-test.sql      (after: 11 of 11 true)
-- Adds the payment insert guard both projects have (sql/20, assert_payment_team_is_pending).
create or replace function public.assert_payment_team_is_pending()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.teams
    where id = new.team_id and status = 'pending'
  ) then
    raise exception 'TEAM_NOT_READY_FOR_PAYMENT' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger payment_team_pending_guard before insert on public.payments
for each row execute function public.assert_payment_team_is_pending();
