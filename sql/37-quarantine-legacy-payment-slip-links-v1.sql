-- BallDoenSai.com — quarantine legacy payment-slip URLs
-- Apply ONLY after the payment-data owner approves disposal of the known historic
-- URL records. Target project: hivedzrwrrcnjrlirhtv.
-- This changes four production payment rows by removing URL-format slip references;
-- it does not delete any Storage object. It is intentionally not idempotent.

begin;

do $$
declare
  v_legacy_count integer;
begin
  select count(*) into v_legacy_count
  from public.payments
  where slip_url ~ '^https?://';

  if v_legacy_count <> 4 then
    raise exception 'LEGACY_SLIP_COUNT_CHANGED: expected 4 URL rows, found %', v_legacy_count
      using errcode = 'P0001';
  end if;
end;
$$;

update public.payments
set slip_url = null
where slip_url ~ '^https?://';

do $$
begin
  if exists (select 1 from public.payments where slip_url ~ '^https?://') then
    raise exception 'LEGACY_SLIP_QUARANTINE_INCOMPLETE' using errcode = 'P0001';
  end if;
end;
$$;

commit;
