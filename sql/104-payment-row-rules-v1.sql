-- 104-payment-row-rules-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval. Read the Project ID in Settings > General before each run. Run as postgres.
-- Needs SQL103 on the same project (payment_rules_guard and enforce_payment_rules()).
-- Precheck: sql/104-payment-row-rules-precheck.sql. Postcheck: sql/104-payment-row-rules-postcheck.sql.
-- Rollback: sql/104-payment-row-rules-down.sql (back to SQL103's function, both projects).
--
-- Why (owner, 24 Nov 2026: "ทำ sql/104"): after SQL103 a payment is confirmed only through
-- confirm_payment_safely and only with a non-blank slip_url, but (review of SQL103)
--   - the "slip" is only text: a coach may insert, through PostgREST, a payment naming a file that
--     was never uploaded, another payer's file, an object of another bucket, or a URL;
--   - a coach may insert any amount, not the tournament's fee;
--   - payments_update_organizer_admin (SQL101) lets an organizer change a payment's slip_url,
--     amount, team_id or user_id, and then confirm it.
-- The rule: a new payment names an object the payer uploaded to the private slips bucket (the name
-- starts with the payer's id, as the slip route and slips_owner_insert make it), for the
-- tournament's fee and PromptPay; after that a payment's fields do not change, except its status
-- through confirm_payment_safely. An admin, and the backend with no signed-in user, may still do
-- anything (the owner's admin answer of 21 Nov 2026).
-- What: enforce_payment_rules() is replaced (same trigger, payment_rules_guard, from SQL103). It
-- keeps every SQL103 rule and adds, for everyone but an admin or the backend:
--   - on insert: SLIP_NOT_UPLOADED unless storage.objects has the slip in bucket 'slips' and the
--     name starts with "<user_id>_"; PAYMENT_AMOUNT_MISMATCH unless amount equals the tournament's
--     fee (0 when null) and promptpay its PromptPay ('' when null), as the slip route writes them;
--   - on update: PAYMENT_LOCKED when any column other than status changes.
-- No table, row, policy or other function changes. Rows today: 0 payments on both projects.
-- The function reads storage.objects as its owner (postgres may select it on both projects).

begin;

do $$
begin
  if to_regprocedure('public.enforce_payment_rules()') is null
     or not exists (select 1 from pg_trigger where tgrelid = 'public.payments'::regclass and tgname = 'payment_rules_guard') then
    raise exception 'SQL104 needs SQL103 (payment_rules_guard) on this project first';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'SQL104 needs storage.objects';
  end if;
end;
$$;

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

commit;
