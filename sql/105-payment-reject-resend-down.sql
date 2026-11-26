-- Rollback of SQL105, either project, as postgres. Back to SQL104: enforce_payment_rules() of SQL104,
-- confirm_payment_safely of SQL103, one payment per team, no reject_payment_safely, no rejection
-- columns. Refuses while any payment is rejected or any team has more than one payment: those rows
-- are evidence (owner, 25 Nov 2026) and the old unique index cannot hold them; review them first.

begin;

do $$
begin
  if exists (select 1 from public.payments where status = 'rejected')
     or exists (select 1 from public.payments group by team_id having count(1) > 1) then
    raise exception 'SQL105 rollback: rejected payments or a team with two payments exist; review them first';
  end if;
end;
$$;

drop function if exists public.reject_payment_safely(uuid, text);

-- SQL104's function, word for word.
create or replace function public.enforce_payment_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_fee numeric;
  v_promptpay text;
begin
  -- The backend (no signed-in user) and admins are not bound by these rules (owner, 21 Nov 2026).
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.slip_url, '')), '') is null then
      raise exception 'SLIP_REQUIRED' using errcode = 'P0001';
    end if;
    -- The slip is an object the payer uploaded to the private bucket (sql/104).
    if split_part(new.slip_url, '_', 1) is distinct from new.user_id::text
       or not exists (select 1 from storage.objects o where o.bucket_id = 'slips' and o.name = new.slip_url) then
      raise exception 'SLIP_NOT_UPLOADED' using errcode = 'P0001';
    end if;
    -- For the tournament's fee and PromptPay, as the slip route writes them (sql/104).
    select tr.fee, tr.promptpay into v_fee, v_promptpay from public.tournaments tr where tr.id = new.tournament_id;
    if new.amount is distinct from coalesce(v_fee, 0)
       or coalesce(new.promptpay, '') is distinct from coalesce(v_promptpay, '') then
      raise exception 'PAYMENT_AMOUNT_MISMATCH' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- After it is made, a payment changes only its status, and only through confirm_payment_safely.
  if (to_jsonb(new) - 'status') is distinct from (to_jsonb(old) - 'status') then
    raise exception 'PAYMENT_LOCKED' using errcode = 'P0001',
      detail = 'A payment''s fields do not change after it is made.';
  end if;
  if new.status is distinct from old.status
     and current_setting('app.confirming_payment', true) is distinct from new.id::text then
    raise exception 'PAYMENT_STATUS_LOCKED' using errcode = 'P0001',
      detail = 'A payment is confirmed only through confirm_payment_safely.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_payment_rules() from public, anon, authenticated;

-- SQL103's function, word for word.
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

  if nullif(btrim(coalesce(v_payment.slip_url, '')), '') is null then
    raise exception 'SLIP_REQUIRED' using errcode = 'P0001';
  end if;

  select status into v_team_status
  from public.teams
  where id = v_payment.team_id
  for update;

  if v_role <> 'admin' and v_team_status is distinct from 'pending' and v_team_status is distinct from 'confirmed' then
    raise exception 'TEAM_NOT_PENDING' using errcode = 'P0001';
  end if;

  -- The one place a payment's status may change (enforce_payment_rules, sql/103).
  perform set_config('app.confirming_payment', v_payment.id::text, true);

  update public.payments
  set status = 'confirmed'
  where id = v_payment.id and status <> 'confirmed';

  update public.teams
  set status = 'confirmed'
  where id = v_payment.team_id and status = 'pending';

  perform set_config('app.confirming_payment', '', true);
end;
$$;

revoke all on function public.confirm_payment_safely(uuid) from public, anon;
grant execute on function public.confirm_payment_safely(uuid) to authenticated, service_role;

drop index if exists public.payments_one_open_payment_per_team_idx;
create unique index if not exists payments_one_payment_per_team_idx on public.payments (team_id);
drop index if exists public.payments_team_id_idx;
alter table public.payments drop constraint if exists payments_rejection_reason_length;
alter table public.payments drop column if exists rejected_at;
alter table public.payments drop column if exists rejection_reason;

commit;
