-- Rollback of SQL102, the same on Staging and Production: removes the status trigger and puts back
-- confirm_payment_safely as sql/production-hardening.sql has it (body md5 prefix cae510df on both
-- projects before SQL102). This brings back every hole SQL102 closed; use it only if SQL102 breaks
-- something, and say what.

begin;

drop trigger if exists team_status_transition_guard on public.teams;
drop function if exists public.enforce_team_status_transition();

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

revoke all on function public.confirm_payment_safely(uuid) from public, anon;
grant execute on function public.confirm_payment_safely(uuid) to authenticated, service_role;

commit;
