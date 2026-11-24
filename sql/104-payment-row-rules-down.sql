-- Rollback of SQL104, the same on Staging and Production: puts back enforce_payment_rules() as
-- SQL103 left it (body md5 prefix a78d1c14). The trigger payment_rules_guard stays (SQL103's).
-- The holes SQL104 closed come back: a payment may name a slip that was never uploaded or another
-- payer's, carry any amount, and an organizer may change its fields.

begin;

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

commit;
