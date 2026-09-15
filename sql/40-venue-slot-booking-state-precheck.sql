-- Read-only precheck for SQL40. Run only against project hivedzrwrrcnjrlirhtv.
-- This reports state only. It does not authorise or apply a migration.

select
  to_regclass('public.venue_profiles') is not null as has_venue_profiles,
  to_regclass('public.venue_courts') is not null as has_venue_courts,
  to_regclass('public.venue_slots') is not null as has_venue_slots,
  to_regclass('public.venue_booking_requests') is not null as has_venue_booking_requests,
  to_regprocedure('public.request_venue_booking_safely(uuid,text,text)') is not null as has_request_rpc,
  to_regprocedure('public.respond_venue_booking_safely(uuid,text)') is not null as has_respond_rpc,
  to_regprocedure('public.cancel_venue_booking_safely(uuid)') is not null as has_cancel_rpc,
  to_regprocedure('public.close_venue_slot_safely(uuid)') is not null as has_close_rpc;
-- Expected: every value true. Otherwise STOP; reconcile SQL23/38/39 first.

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.venue_slots'::regclass
  and conname = 'venue_slots_status_check';
-- Expected before SQL40: one row allowing open and blocked, but not reserved.

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'venue_booking_requests'
  and column_name in ('venue_name_snapshot', 'court_name_snapshot', 'slot_starts_at_snapshot', 'slot_ends_at_snapshot', 'price_baht_snapshot')
order by column_name;
-- Expected before the first SQL40 apply: zero rows. A partial set means STOP.

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'venue_booking_requests'
  and indexname = 'venue_booking_requests_live_slot_idx';
-- Expected: one UNIQUE partial index for pending and confirmed bookings.

select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('venue_slots', 'venue_booking_requests')
order by c.relname;
-- Expected: two rows with relrowsecurity=true.

select tablename, policyname, roles, cmd, qual
from pg_policies
where schemaname = 'public'
  and tablename in ('venue_slots', 'venue_booking_requests')
order by tablename, policyname;
-- Record the complete policy list. SQL40 does not add a requester slot policy.

select
  count(*) filter (where s.status = 'blocked') as blocked_slots_baseline,
  count(*) filter (
    where s.status = 'blocked'
      and exists (
        select 1 from public.venue_booking_requests b
        where b.slot_id = s.id and b.status in ('pending', 'confirmed')
      )
  ) as blocked_slots_with_active_booking
from public.venue_slots s;
-- Record both values. SQL40 must not reinterpret existing blocked rows as reserved.

select b.status as booking_status, count(*) as open_slots_to_reserve
from public.venue_slots s
join public.venue_booking_requests b on b.slot_id = s.id
where s.status = 'open'
  and b.status in ('pending', 'confirmed')
group by b.status
order by b.status;
-- Aggregate only; these open rows are the SQL40 backfill candidates.

select p.proname, p.prosecdef as security_definer, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('request_venue_booking_safely', 'respond_venue_booking_safely', 'cancel_venue_booking_safely', 'close_venue_slot_safely')
order by p.proname;
-- Expected: four SECURITY DEFINER rows. Record their current search_path values.

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
-- Expected after SQL39/38: anon=false, service_role=false, authenticated=true.

select count(*) as booking_rows_missing_source_data
from public.venue_booking_requests b
left join public.venue_slots s on s.id = b.slot_id
left join public.venue_courts c on c.id = s.court_id
left join public.venue_profiles v on v.id = c.venue_id
where s.id is null or c.id is null or v.id is null
   or s.starts_at is null or s.ends_at is null or s.price_baht is null
   or c.name is null or v.name is null;
-- Expected: 0. Otherwise the snapshot backfill cannot be made NOT NULL; STOP.
