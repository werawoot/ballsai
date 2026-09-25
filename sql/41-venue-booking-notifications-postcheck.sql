-- Read-only post-check for SQL41. Run only against project hivedzrwrrcnjrlirhtv.
-- Every statement is a SELECT.
select pg_get_constraintdef(con.oid) as notification_type_constraint
from pg_constraint con
where con.conrelid = 'public.notifications'::regclass
  and con.conname = 'notifications_notification_type_check';
-- Expected: the five earlier values plus 'venue_booking'.
select
  p.proname,
  p.prosecdef as security_definer,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('notify_venue_booking_requested', 'notify_venue_booking_responded')
order by p.proname;
-- Expected: two rows; security_definer = true; proconfig = {search_path=""};
-- anon, authenticated and service_role all false.
select tgname, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger
where tgrelid = 'public.venue_booking_requests'::regclass
  and not tgisinternal
order by tgname;
-- Expected: venue_booking_notify_requested AFTER INSERT and
-- venue_booking_notify_responded AFTER UPDATE OF status, both tgenabled = 'O'.
select
  has_function_privilege('authenticated', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') as create_notification_authenticated,
  has_function_privilege('anon', 'public.create_notification(uuid,text,text,text,text,text)', 'execute') as create_notification_anon;
-- Expected: both still false. SQL41 must not have handed the helper back to browsers.
select notification_type, count(*) as rows
from public.notifications
group by notification_type
order by notification_type;
-- Expected: the precheck baseline unchanged. SQL41 creates no notification by itself;
-- rows appear only when a real booking moves.
select count(*) as venue_booking_rows_with_unexpected_href
from public.notifications
where notification_type = 'venue_booking'
  and href not in ('/venue', '/venues/bookings');
-- Expected: 0.
