-- 54-venue-cancel-notification-fix-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Apply after SQL41 (it replaces SQL41's trigger
-- function) and in the same round as SQL46 (whose agreed cancellations it words).
--
-- Why: SQL41's notify_venue_booking_responded() sends the venue owner "ผู้ขอยกเลิกคำขอจอง"
-- (the requester cancelled) for every cancelled booking. That was true while the only way
-- to cancel was cancel_venue_booking_safely, which lets the requester withdraw a pending
-- request. SQL46 adds a second way: on a confirmed booking one side proposes a
-- cancellation and the other accepts it. Then:
--   * the owner is told the requester cancelled, even when the owner proposed it;
--   * the requester is never told the booking was cancelled.
--
-- What: the same function, with one branch split by where the booking came from.
--   * pending -> cancelled (the requester withdrew): unchanged text, recipient and key.
--   * confirmed -> cancelled (agreed through SQL46): the participant who did not perform
--     the change is told the cancellation went through, with a key per recipient. If the
--     change came from neither participant (an admin, or no signed-in user), both are told.
-- The confirmed and declined branches are copied from SQL41 unchanged.

begin;

do $$
begin
  if to_regprocedure('public.notify_venue_booking_responded()') is null then
    raise exception 'SQL54 needs SQL41 (notify_venue_booking_responded) applied first';
  end if;
  if to_regprocedure('public.create_notification(uuid, text, text, text, text, text)') is null then
    raise exception 'SQL54 needs create_notification (SQL17)';
  end if;
end;
$$;

create or replace function public.notify_venue_booking_responded()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_title text;
  v_outcome text;
  v_recipient uuid;
  v_href text;
  v_source_prefix text;
  v_when text;
  v_body text;
  v_actor uuid;
  v_party uuid;
begin
  -- An update that leaves the status alone is not a transition and must not notify.
  if new.status is not distinct from old.status then
    return new;
  end if;

  -- The slot time is shown in Asia/Bangkok, not the database time zone. The SQL40
  -- snapshot never changes under the recipient.
  v_when := to_char(new.slot_starts_at_snapshot at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');

  if new.status = 'cancelled' then
    select v.owner_id into v_owner_id
    from public.venue_slots s
    join public.venue_courts c on c.id = s.court_id
    join public.venue_profiles v on v.id = c.venue_id
    where s.id = new.slot_id;

    if old.status = 'pending' then
      -- The requester withdrew a request that was never confirmed (SQL40's
      -- cancel_venue_booking_safely allows nothing else).
      if v_owner_id is not null then
        perform public.create_notification(
          v_owner_id,
          'venue_booking',
          'ผู้ขอยกเลิกคำขอจอง',
          left(coalesce(new.venue_name_snapshot, '-') || ' · ' || coalesce(new.court_name_snapshot, '-')
            || ' · ' || coalesce(v_when, '-') || ' น.'
            || ' · ช่วงเวลานี้กลับมาเปิดให้จองแล้ว', 500),
          '/venue',
          'venue_booking_cancelled:' || new.id::text
        );
      end if;
    elsif old.status = 'confirmed' then
      -- Agreed through SQL46: one side proposed, the other accepted. Tell the side that
      -- did not perform this change; tell both if neither participant performed it.
      v_actor := auth.uid();
      v_body := left(coalesce(new.venue_name_snapshot, '-') || ' · ' || coalesce(new.court_name_snapshot, '-')
        || ' · ' || coalesce(v_when, '-') || ' น.'
        || ' · ยกเลิกตามที่ทั้งสองฝ่ายตกลงกัน ช่วงเวลานี้กลับมาเปิดให้จองแล้ว', 500);
      foreach v_party in array array[new.requester_id, v_owner_id] loop
        if v_party is null or v_party is not distinct from v_actor then
          continue;
        end if;
        perform public.create_notification(
          v_party,
          'venue_booking',
          'การจองถูกยกเลิกแล้ว',
          v_body,
          case when v_party = v_owner_id then '/venue' else '/venues/bookings/' || new.id::text end,
          'venue_booking_cancel_agreed:' || new.id::text || ':' || v_party::text
        );
      end loop;
    end if;
    return new;
  end if;

  if new.status = 'confirmed' then
    v_title := 'เจ้าของสนามยืนยันการจองแล้ว';
    v_outcome := 'ช่วงเวลานี้เป็นของคุณแล้ว';
    v_recipient := new.requester_id;
    v_href := '/venues/bookings';
    v_source_prefix := 'venue_booking_confirmed:';
  elsif new.status = 'declined' then
    v_title := 'คำขอจองถูกปฏิเสธ';
    v_outcome := 'ช่วงเวลานี้กลับมาเปิดให้จองแล้ว';
    v_recipient := new.requester_id;
    v_href := '/venues/bookings';
    v_source_prefix := 'venue_booking_declined:';
  else
    return new;
  end if;

  if v_recipient is null then
    return new;
  end if;

  perform public.create_notification(
    v_recipient,
    'venue_booking',
    v_title,
    left(coalesce(new.venue_name_snapshot, '-') || ' · ' || coalesce(new.court_name_snapshot, '-')
      || ' · ' || coalesce(v_when, '-') || ' น.'
      || ' · ' || v_outcome, 500),
    v_href,
    v_source_prefix || new.id::text
  );
  return new;
end;
$$;

-- Trigger functions are called by the trigger, never by a client.
revoke all on function public.notify_venue_booking_responded() from public, anon, authenticated, service_role;

drop trigger if exists venue_booking_notify_responded on public.venue_booking_requests;
create trigger venue_booking_notify_responded
after update of status on public.venue_booking_requests
for each row execute function public.notify_venue_booking_responded();

do $$
declare
  v_role text;
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'notify_venue_booking_responded'
      and p.prosecdef and p.prosrc like '%venue_booking_cancel_agreed:%'
      and p.prosrc like '%old.status = ''pending''%'
  ) then
    raise exception 'SQL54 function body not in place';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid = 'public.venue_booking_requests'::regclass
      and t.tgname = 'venue_booking_notify_responded' and not t.tgisinternal
      and t.tgfoid = 'public.notify_venue_booking_responded()'::regprocedure
  ) then
    raise exception 'SQL54 trigger venue_booking_notify_responded missing';
  end if;
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_function_privilege(v_role, 'public.notify_venue_booking_responded()', 'EXECUTE') then
      raise exception 'SQL54: % can still execute the trigger function', v_role;
    end if;
  end loop;
end;
$$;

commit;
