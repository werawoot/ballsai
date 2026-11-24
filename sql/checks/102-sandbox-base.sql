-- Sandbox only for SQL102. Never run on Staging or Production: it creates roles, schemas, tables
-- and rows. The shape after SQL101 (policies of sql/supabase-rls.sql) with today's
-- confirm_payment_safely (sql/production-hardening.sql) and a stand-in for the submit function.
-- In an empty local Postgres 16 or 17 database, run in order:
--   psql -d <db> -f sql/checks/101-sandbox-base.sql
--   psql -d <db> -f sql/101-teams-payments-rls-v1.sql
--   psql -d <db> -f sql/checks/102-sandbox-base.sql
--   psql -d <db> -f sql/checks/102-sandbox-test.sql      (before SQL102: 8 of 15 false)
--   psql -d <db> -f sql/102-team-status-rules-v1.sql
--   psql -d <db> -f sql/checks/102-sandbox-test.sql      (after: 15 of 15 true)
create or replace function public.confirm_payment_safely(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payment public.payments%rowtype;
  v_organizer_id uuid;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role not in ('organizer', 'admin') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND' using errcode = 'P0002';
  end if;

  select organizer_id into v_organizer_id
  from public.tournaments
  where id = v_payment.tournament_id;

  if v_role <> 'admin' and v_organizer_id <> v_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.payments
  set status = 'confirmed'
  where id = v_payment.id and status <> 'confirmed';

  update public.teams
  set status = 'confirmed'
  where id = v_payment.team_id and status <> 'confirmed';
end;
$$;
revoke all on function public.confirm_payment_safely(uuid) from public;
grant execute on function public.confirm_payment_safely(uuid) to authenticated;
grant usage on schema auth to authenticated;
-- Stand-in for submit_tournament_team_safely: the only part that matters here, draft to pending as
-- the coach, through a security definer function, as sql/99 does it.
create function public.sandbox_submit(p_team uuid) returns void language plpgsql security definer set search_path = public as $$
begin update public.teams set status = 'pending' where id = p_team and status = 'draft'; end $$;
grant execute on function public.sandbox_submit(uuid) to authenticated;
-- Production's check on team status (read 24 Nov 2026).
alter table public.teams add constraint teams_status_check check (status = any (array['draft', 'pending', 'confirmed', 'rejected']));
-- A tournament with no organizer, and a profile-less user (the NULL holes in confirm_payment_safely).
insert into public.tournaments (id, name, status, organizer_id, fee) values ('00000000-0000-4000-8000-0000000000f4','free','open','00000000-0000-4000-8000-0000000000a1',null),('00000000-0000-4000-8000-0000000000f5','orphan','open',null,300);
