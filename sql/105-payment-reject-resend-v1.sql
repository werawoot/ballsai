-- 105-payment-reject-resend-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Needs SQL104 on the same project (payment_rules_guard with enforce_payment_rules() of SQL104).
-- Precheck: sql/105-payment-reject-resend-precheck.sql. Postcheck: sql/105-payment-reject-resend-postcheck.sql.
-- Rollback: sql/105-payment-reject-resend-down.sql (only while no team has two payments).
--
-- Why (owner, 25 Nov 2026): "ปฏิเสธแล้วจบ โค้ชส่งสลิปใหม่ได้", "ต้องใส่เหตุผลสั้น ๆ",
-- "เก็บไว้เป็นหลักฐาน". Until now an organizer could confirm a slip or reject the whole team (final,
-- sql/102); a wrong transfer cost the team its entry. A team could hold one payment only
-- (payments_one_payment_per_team_idx), and a payment set to rejected (only an admin could) could
-- still be confirmed later.
-- What:
--   - payments gets rejection_reason (1 to 200 characters) and rejected_at;
--   - reject_payment_safely(payment, reason): the organizer of the payment's tournament (or an
--     admin) rejects a waiting payment of a waiting team, with a reason; the team keeps waiting;
--     the slip file and the row stay as evidence;
--   - confirm_payment_safely refuses a rejected payment (PAYMENT_REJECTED), except for an admin;
--     otherwise word for word SQL103's;
--   - the unique index becomes one payment per team that is not rejected, so the coach can send a
--     new slip; a plain index on team_id keeps delete_team's lookup and the dashboard's;
--   - enforce_payment_rules() (SQL104's, same trigger) also lets reject_payment_safely write the
--     two new columns, and keeps everything else.
-- Rows today: 0 payments on both projects.

begin;

do $$
begin
  if not exists (select 1 from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'payment_rules_guard')
     or to_regprocedure('public.confirm_payment_safely(uuid)') is null then
    raise exception 'SQL105 needs SQL103 and SQL104 on this project first';
  end if;
  if exists (select 1 from public.payments where status not in ('pending', 'confirmed', 'rejected')) then
    raise exception 'SQL105: a payment has a status other than pending, confirmed or rejected; review it first';
  end if;
end;
$$;

alter table public.payments add column if not exists rejection_reason text;
alter table public.payments add column if not exists rejected_at timestamptz;
alter table public.payments drop constraint if exists payments_rejection_reason_length;
alter table public.payments add constraint payments_rejection_reason_length
  check (rejection_reason is null or char_length(rejection_reason) between 1 and 200);

-- One payment per team that is not rejected; the rejected ones stay as evidence.
create index if not exists payments_team_id_idx on public.payments (team_id);
drop index if exists public.payments_one_payment_per_team_idx;
create unique index if not exists payments_one_open_payment_per_team_idx
  on public.payments (team_id) where status <> 'rejected';

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
    -- A new payment carries no rejection (sql/105).
    if new.rejection_reason is not null or new.rejected_at is not null then
      raise exception 'PAYMENT_LOCKED' using errcode = 'P0001';
    end if;
    return new;
  end if;

  -- After it is made, a payment changes only its status (and, when rejected, the reason and time),
  -- and only through confirm_payment_safely or reject_payment_safely.
  if (to_jsonb(new) - 'status' - 'rejection_reason' - 'rejected_at') is distinct from (to_jsonb(old) - 'status' - 'rejection_reason' - 'rejected_at') then
    raise exception 'PAYMENT_LOCKED' using errcode = 'P0001',
      detail = 'A payment''s fields do not change after it is made.';
  end if;
  if (new.status is distinct from old.status
      or new.rejection_reason is distinct from old.rejection_reason
      or new.rejected_at is distinct from old.rejected_at)
     and current_setting('app.confirming_payment', true) is distinct from new.id::text then
    raise exception 'PAYMENT_STATUS_LOCKED' using errcode = 'P0001',
      detail = 'A payment is confirmed or rejected only through confirm_payment_safely or reject_payment_safely.';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_payment_rules() from public, anon, authenticated;

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

  -- A rejected slip is final (owner, 25 Nov 2026); the coach sends a new one (sql/105).
  if v_role <> 'admin' and v_payment.status = 'rejected' then
    raise exception 'PAYMENT_REJECTED' using errcode = 'P0001';
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

create or replace function public.reject_payment_safely(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_reason text := btrim(coalesce(p_reason, ''));
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

  if char_length(v_reason) not between 1 and 200 then
    raise exception 'REJECTION_REASON_REQUIRED' using errcode = 'P0001';
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

  -- Only a slip waiting for review is rejected; a confirmed one is final (sql/102, sql/105).
  if v_payment.status is distinct from 'pending' then
    raise exception 'PAYMENT_NOT_PENDING' using errcode = 'P0001';
  end if;

  select status into v_team_status
  from public.teams
  where id = v_payment.team_id
  for update;

  if v_role <> 'admin' and v_team_status is distinct from 'pending' then
    raise exception 'TEAM_NOT_PENDING' using errcode = 'P0001';
  end if;

  perform set_config('app.confirming_payment', v_payment.id::text, true);

  -- The row and its slip file stay as evidence (owner, 25 Nov 2026); the team keeps waiting.
  update public.payments
  set status = 'rejected', rejection_reason = v_reason, rejected_at = now()
  where id = v_payment.id;

  perform set_config('app.confirming_payment', '', true);
end;
$$;

revoke all on function public.reject_payment_safely(uuid, text) from public, anon;
grant execute on function public.reject_payment_safely(uuid, text) to authenticated, service_role;

commit;
