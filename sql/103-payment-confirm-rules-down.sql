-- Rollback of SQL103, the same on Staging and Production: removes the payment trigger and puts back
-- confirm_payment_safely as SQL102 left it (body md5 prefix 6d92550e). The holes SQL103 closed
-- come back: an organizer may confirm a payment by a direct update, and a payment may have no slip.

begin;

drop trigger if exists payment_rules_guard on public.payments;
drop function if exists public.enforce_payment_rules();

create or replace function public.confirm_payment_safely(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_payment public.payments%rowtype;
  v_organizer_id uuid;
  v_team_status text;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select role into v_role from public.profiles where id = v_user_id;
  if v_role is null or v_role not in ('organizer', 'admin') then
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

  if v_role <> 'admin' and v_organizer_id is distinct from v_user_id then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select status into v_team_status
  from public.teams
  where id = v_payment.team_id
  for update;

  if v_team_status is distinct from 'pending' and v_team_status is distinct from 'confirmed' then
    raise exception 'TEAM_NOT_PENDING' using errcode = 'P0001';
  end if;

  update public.payments
  set status = 'confirmed'
  where id = v_payment.id and status <> 'confirmed';

  update public.teams
  set status = 'confirmed'
  where id = v_payment.team_id and status = 'pending';
end;
$$;

revoke all on function public.confirm_payment_safely(uuid) from public, anon;
grant execute on function public.confirm_payment_safely(uuid) to authenticated, service_role;

commit;
