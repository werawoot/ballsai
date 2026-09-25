-- Read-only precheck for SQL41. Run only against project hivedzrwrrcnjrlirhtv.
-- Every statement is a SELECT. It reports state and authorises nothing: applying SQL41
-- is a separate action that needs explicit approval from the production owner.
-- Confirm the project ref in the dashboard URL first; this file cannot verify it.
select
  to_regclass('public.notifications') is not null as has_notifications,
  to_regclass('public.venue_booking_requests') is not null as has_booking_requests,
  to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null as has_create_notification,
  to_regprocedure('public.notify_venue_booking_requested()') is null as requested_trigger_fn_absent,
  to_regprocedure('public.notify_venue_booking_responded()') is null as responded_trigger_fn_absent;
-- Expected: first three true; both *_absent true. An existing trigger function means a
-- previous draft ran: STOP and report, do not overwrite it.
select pg_get_constraintdef(con.oid) as current_notification_type_constraint
from pg_constraint con
where con.conrelid = 'public.notifications'::regclass
  and con.conname = 'notifications_notification_type_check';
-- Expected: the five SQL21 values, and no 'venue_booking' yet. Record this verbatim as
-- the rollback baseline.
select notification_type, count(*) as rows
from public.notifications
group by notification_type
order by notification_type;
-- Expected: baseline counts per type. Record them; a rollback that narrows the
-- constraint again must first account for every 'venue_booking' row created after this.
select
  count(*) as venue_owners,
  count(*) filter (where not exists (select 1 from auth.users u where u.id = v.owner_id)) as owners_without_auth_user
from public.venue_profiles v;
-- Expected: owners_without_auth_user = 0. notifications.user_id references auth.users,
-- so a mismatch would make the trigger fail and roll back a real booking.
select
  has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') as create_notification_authenticated,
  has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') as create_notification_anon;
-- Expected: both false, as SQL19 left them.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'public.venue_booking_requests'::regclass
  and not tgisinternal
order by tgname;
-- Expected: no row named venue_booking_notify_requested or venue_booking_notify_responded.
select
  count(*) as booking_rows,
  count(*) filter (where venue_name_snapshot is null or court_name_snapshot is null) as rows_missing_snapshot,
  count(*) filter (where slot_starts_at_snapshot is null) as rows_missing_snapshot_time
from public.venue_booking_requests;
-- Expected: rows_missing_snapshot = 0 AND rows_missing_snapshot_time = 0, proving SQL40
-- completed. The notification body reads the venue name, the court name and the slot
-- start time from these columns, so a null time would render as "-" to a real user.
