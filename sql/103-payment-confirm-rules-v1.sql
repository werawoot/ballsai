-- 103-payment-confirm-rules-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Needs SQL101 and SQL102 on the same project.
-- Precheck: sql/103-payment-confirm-rules-precheck.sql. Postcheck: sql/103-payment-confirm-rules-postcheck.sql.
-- Rollback: sql/103-payment-confirm-rules-down.sql (back to SQL102's state, both projects).
--
-- Why (owner, 24 Nov 2026: "ปิดด้วย sql/103"): SQL102 confirms a paid team only when its payment
-- is confirmed, but trusted any confirmed payment. payments_update_organizer_admin (SQL101) lets
-- an organizer set a payment of their tournament to confirmed by a direct update, outside the
-- confirm button, and a coach may insert a payment with no slip through PostgREST; together that
-- is the "paid outside the app" path the owner closed on 21 Nov 2026.
-- The rule: a payment is confirmed only through confirm_payment_safely, and only with a slip; a new
-- payment carries a slip; an admin, and the backend with no signed-in user, may still do anything
-- (the owner's admin answer of 21 Nov 2026).
-- What:
--   - enforce_payment_rules(): a BEFORE INSERT OR UPDATE trigger on public.payments. For anyone but
--     an admin or the backend: an insert needs a slip (SLIP_REQUIRED); a change of status is allowed
--     only inside confirm_payment_safely, which marks its own payment for its own transaction
--     (PAYMENT_STATUS_LOCKED otherwise); a confirmed payment's slip cannot be removed.
--   - confirm_payment_safely(uuid): same name, arguments and grants; refuses a payment with no
--     slip (SLIP_REQUIRED) and marks the payment it confirms; an admin is no longer refused for a
--     team that is not waiting (the payment is confirmed, the team is left as it is).
-- No table, row, policy or other function changes. Rows today: 0 payments on both projects.
-- The mark is a transaction-local setting (set_config(..., true)); PostgREST runs each request in
-- its own transaction and exposes no way to set it, so only this function can.

begin;

do $$
begin
  if to_regclass('public.payments') is null or to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL103 needs public.payments and public.is_admin()';
  end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.teams'::regclass and tgname = 'team_status_transition_guard') then
    raise exception 'SQL103 needs SQL102 (team_status_transition_guard) on this project first';
  end if;
end;
$$;

create or replace function public.enforce_payment_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The backend (no signed-in user) and admins are not bound by these rules (owner, 21 Nov 2026).
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if nullif(btrim(coalesce(new.slip_url, '')), '') is null then
      raise exception 'SLIP_REQUIRED' using errcode = 'P0001';
    end if;
    return new;
  end if;

  if new.status is distinct from old.status
     and current_setting('app.confirming_payment', true) is distinct from new.id::text then
    raise exception 'PAYMENT_STATUS_LOCKED' using errcode = 'P0001',
      detail = 'A payment is confirmed only through confirm_payment_safely.';
  end if;
  if old.status = 'confirmed' and nullif(btrim(coalesce(new.slip_url, '')), '') is null then
    raise exception 'SLIP_REQUIRED' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_payment_rules() from public, anon, authenticated;

drop trigger if exists payment_rules_guard on public.payments;
create trigger payment_rules_guard
before insert or update on public.payments
for each row execute function public.enforce_payment_rules();

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

commit;
