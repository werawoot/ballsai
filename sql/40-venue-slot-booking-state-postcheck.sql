-- Read-only post-check for SQL40. Run only against project hivedzrwrrcnjrlirhtv.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'venue_booking_requests'
  and column_name in ('venue_name_snapshot', 'court_name_snapshot', 'slot_starts_at_snapshot', 'slot_ends_at_snapshot', 'price_baht_snapshot')
order by column_name;
-- Expected: five rows, all is_nullable=NO.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.venue_slots'::regclass
  and conname = 'venue_slots_status_check';
-- Expected: one row allowing exactly open, blocked and reserved.

select status, count(*) as slot_count
from public.venue_slots
group by status
order by status;
-- Record the result. Compare blocked count with the precheck baseline.

select
  count(*) filter (
    where s.status = 'open'
      and exists (
        select 1 from public.venue_booking_requests b
        where b.slot_id = s.id and b.status in ('pending', 'confirmed')
      )
  ) as open_slots_with_active_booking,
  count(*) filter (
    where s.status = 'reserved'
      and not exists (
        select 1 from public.venue_booking_requests b
        where b.slot_id = s.id and b.status in ('pending', 'confirmed')
      )
  ) as reserved_slots_without_active_booking
from public.venue_slots s;
-- Expected: 0, 0.

select count(*) as booking_rows_missing_snapshot
from public.venue_booking_requests
where venue_name_snapshot is null
   or court_name_snapshot is null
   or slot_starts_at_snapshot is null
   or slot_ends_at_snapshot is null
   or price_baht_snapshot is null;
-- Expected: 0.

select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('request_venue_booking_safely', 'respond_venue_booking_safely', 'cancel_venue_booking_safely', 'close_venue_slot_safely')
order by p.proname;
-- Expected: four rows; security_definer=true; proconfig={search_path=""}.

select
  has_function_privilege('anon', 'public.request_venue_booking_safely(uuid,text,text)', 'execute') as request_anon,
  has_function_privilege('service_role', 'public.request_venue_booking_safely(uuid,text,text)', 'execute') as request_service_role,
  has_function_privilege('authenticated', 'public.request_venue_booking_safely(uuid,text,text)', 'execute') as request_authenticated,
  has_function_privilege('anon', 'public.respond_venue_booking_safely(uuid,text)', 'execute') as respond_anon,
  has_function_privilege('service_role', 'public.respond_venue_booking_safely(uuid,text)', 'execute') as respond_service_role,
  has_function_privilege('authenticated', 'public.respond_venue_booking_safely(uuid,text)', 'execute') as respond_authenticated,
  has_function_privilege('anon', 'public.cancel_venue_booking_safely(uuid)', 'execute') as cancel_anon,
  has_function_privilege('service_role', 'public.cancel_venue_booking_safely(uuid)', 'execute') as cancel_service_role,
  has_function_privilege('authenticated', 'public.cancel_venue_booking_safely(uuid)', 'execute') as cancel_authenticated,
  has_function_privilege('anon', 'public.close_venue_slot_safely(uuid)', 'execute') as close_anon,
  has_function_privilege('service_role', 'public.close_venue_slot_safely(uuid)', 'execute') as close_service_role,
  has_function_privilege('authenticated', 'public.close_venue_slot_safely(uuid)', 'execute') as close_authenticated;
-- Expected: every anon/service_role=false and every authenticated=true.

select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('venue_slots', 'venue_booking_requests')
order by tablename, policyname;
-- Expected: no venue_slots_select_requester policy. Booking history uses snapshots.
