-- 41-venue-booking-notifications-v1.sql
-- In-app notifications for the venue booking flow.
--
-- Triggers on public.venue_booking_requests only. This migration deliberately does NOT
-- redefine any RPC from SQL23, SQL38 or SQL40: those are applied and own the locking and
-- slot-status logic. It also does not touch public.create_notification (see SQL42 for the
-- separate search_path hardening of that applied function).
--
-- A failed notification rolls the whole booking transaction back. That is the intended
-- closed-beta behaviour: a silently missing notification is worse than a visible failure
-- while the flow is still being proved with real users.
--
-- Apply to Supabase project hivedzrwrrcnjrlirhtv only, after SQL17, SQL19, SQL21,
-- SQL23 and SQL40.

begin;

do $$
begin
  if to_regclass('public.notifications') is null then
    raise exception 'SQL41 requires the notifications table from SQL17';
  end if;
  if to_regclass('public.venue_booking_requests') is null
     or to_regclass('public.venue_slots') is null
     or to_regclass('public.venue_courts') is null
     or to_regclass('public.venue_profiles') is null then
    raise exception 'SQL41 requires the venue tables from SQL23';
  end if;
  if to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is null then
    raise exception 'SQL41 requires public.create_notification from SQL17';
  end if;

  -- SQL40 snapshot columns are what the requester notification reads.
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venue_booking_requests'
      and column_name = 'venue_name_snapshot'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'venue_booking_requests'
      and column_name = 'slot_starts_at_snapshot'
  ) then
    raise exception 'SQL41 requires the booking snapshot columns from SQL40';
  end if;

  if to_regprocedure('public.notify_venue_booking_requested()') is not null
     or to_regprocedure('public.notify_venue_booking_responded()') is not null then
    raise exception 'SQL41 trigger functions already exist; reconcile before applying';
  end if;

  -- notifications.user_id references auth.users. venue_profiles.owner_id references
  -- public.profiles. They share the same id, but prove it rather than assume it.
  if exists (
    select 1
    from public.venue_profiles v
    where not exists (select 1 from auth.users u where u.id = v.owner_id)
  ) then
    raise exception 'SQL41 found a venue owner with no auth.users row; reconcile before applying';
  end if;
end;
$$;

-- Widen the type list. SQL21 owns the current constraint; keep all five existing values.
alter table public.notifications
  drop constraint if exists notifications_notification_type_check;
alter table public.notifications
  add constraint notifications_notification_type_check
  check (notification_type in (
    'match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link', 'venue_booking'
  ));

create or replace function public.notify_venue_booking_requested()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_when text;
begin
  select v.owner_id into v_owner_id
  from public.venue_slots s
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where s.id = new.slot_id;

  if v_owner_id is null then
    return new;
  end if;

  -- Immutable SQL40 snapshot, shown in Asia/Bangkok so the reader sees Thai local time
  -- regardless of the database time zone.
  v_when := to_char(new.slot_starts_at_snapshot at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');

  -- Carries venue, court and slot time only: no requester identity, purpose or note.
  perform public.create_notification(
    v_owner_id,
    'venue_booking',
    'มีคำขอจองสนามใหม่',
    left(coalesce(new.venue_name_snapshot, '-') || ' · ' || coalesce(new.court_name_snapshot, '-')
      || ' · ' || coalesce(v_when, '-') || ' น.'
      || ' · เปิดหน้าจัดการสนามเพื่อตอบรับหรือปฏิเสธ', 500),
    '/venue',
    'venue_booking_requested:' || new.id::text
  );
  return new;
end;
$$;

drop trigger if exists venue_booking_notify_requested on public.venue_booking_requests;
create trigger venue_booking_notify_requested
after insert on public.venue_booking_requests
for each row execute function public.notify_venue_booking_requested();

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
begin
  -- An update that leaves the status alone is not a transition and must not notify.
  if new.status is not distinct from old.status then
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
  elsif new.status = 'cancelled' then
    select v.owner_id into v_owner_id
    from public.venue_slots s
    join public.venue_courts c on c.id = s.court_id
    join public.venue_profiles v on v.id = c.venue_id
    where s.id = new.slot_id;

    v_title := 'ผู้ขอยกเลิกคำขอจอง';
    v_outcome := 'ช่วงเวลานี้กลับมาเปิดให้จองแล้ว';
    v_recipient := v_owner_id;
    v_href := '/venue';
    v_source_prefix := 'venue_booking_cancelled:';
  else
    return new;
  end if;

  if v_recipient is null then
    return new;
  end if;

  -- Reads the immutable SQL40 snapshot so the text never changes under the recipient
  -- and no live venue row has to be joined for the requester's side. The slot time is
  -- shown in Asia/Bangkok, not the database time zone.
  v_when := to_char(new.slot_starts_at_snapshot at time zone 'Asia/Bangkok', 'DD/MM/YYYY HH24:MI');

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

drop trigger if exists venue_booking_notify_responded on public.venue_booking_requests;
create trigger venue_booking_notify_responded
after update of status on public.venue_booking_requests
for each row execute function public.notify_venue_booking_responded();

-- Trigger functions are called by the trigger, never by a client.
revoke all on function public.notify_venue_booking_requested() from public;
revoke all on function public.notify_venue_booking_requested() from anon;
revoke all on function public.notify_venue_booking_requested() from authenticated;
revoke all on function public.notify_venue_booking_requested() from service_role;
revoke all on function public.notify_venue_booking_responded() from public;
revoke all on function public.notify_venue_booking_responded() from anon;
revoke all on function public.notify_venue_booking_responded() from authenticated;
revoke all on function public.notify_venue_booking_responded() from service_role;

do $$
begin
  -- SQL19 removed EXECUTE on create_notification from browsers. Confirm SQL41 did not
  -- hand it back, and that the new trigger functions are not callable either.
  if has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text,text)', 'execute')
     or has_function_privilege('authenticated', 'public.notify_venue_booking_requested()', 'execute')
     or has_function_privilege('anon', 'public.notify_venue_booking_requested()', 'execute')
     or has_function_privilege('authenticated', 'public.notify_venue_booking_responded()', 'execute')
     or has_function_privilege('anon', 'public.notify_venue_booking_responded()', 'execute') then
    raise exception 'SQL41 notification privilege verification failed';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.venue_booking_requests'::regclass
      and tgname = 'venue_booking_notify_requested'
  ) or not exists (
    select 1 from pg_trigger
    where tgrelid = 'public.venue_booking_requests'::regclass
      and tgname = 'venue_booking_notify_responded'
  ) then
    raise exception 'SQL41 trigger verification failed';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
