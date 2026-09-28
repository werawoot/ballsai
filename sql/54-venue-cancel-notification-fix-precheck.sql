-- Read-only precheck for SQL54. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select to_regprocedure('public.notify_venue_booking_responded()') is not null as sql41_function,
       exists (select 1 from pg_trigger
               where tgrelid = to_regclass('public.venue_booking_requests')
                 and tgname = 'venue_booking_notify_responded' and not tgisinternal) as sql41_trigger,
       to_regclass('public.venue_booking_coordination') is not null as sql46_coordination,
       to_regprocedure('public.create_notification(uuid, text, text, text, text, text)') is not null as create_notification;
-- Expected: sql41_function and sql41_trigger true (apply SQL41 first otherwise). SQL46 may
-- be false if it is applied in the same round; SQL54 then only matters once SQL46 is in.

select md5(p.prosrc) as current_body_md5, p.prosrc like '%venue_booking_cancel_agreed:%' as already_sql54
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'notify_venue_booking_responded';
-- Record current_body_md5. already_sql54 = true means SQL54 is already in: re-running is safe.
