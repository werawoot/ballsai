-- Read-only postcheck for SQL46. Run only against project hivedzrwrrcnjrlirhtv.
select
  to_regprocedure('public.manage_venue_beta(text,uuid,jsonb)') is not null as has_manage,
  to_regprocedure('public.coordinate_venue_booking_beta(text,uuid,jsonb)') is not null as has_coordinate,
  to_regprocedure('public.venue_booking_options_beta(uuid)') is not null as has_options,
  to_regprocedure('public.venue_booking_participant_beta(uuid)') is not null as has_participant,
  to_regclass('public.venue_booking_coordination') is not null as has_coordination_table;
-- Expected: all true.

select
  p.proname,
  p.prosecdef as is_security_definer,
  p.proconfig as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('manage_venue_beta', 'coordinate_venue_booking_beta',
                    'venue_booking_options_beta', 'venue_booking_participant_beta',
                    'guard_venue_slot_overlap_beta')
order by p.proname;
-- Expected: every row is_security_definer true and settings contains search_path=.
-- A non-empty search_path on any of them means STOP.

select
  p.proname,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('manage_venue_beta', 'coordinate_venue_booking_beta',
                    'venue_booking_options_beta', 'venue_booking_participant_beta',
                    'guard_venue_slot_overlap_beta')
order by p.proname;
-- Expected: anon false and service_role false everywhere. authenticated true for the
-- four browser RPCs and false for guard_venue_slot_overlap_beta, which is trigger-only.

select
  conname,
  contype,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.venue_slots'::regclass and contype = 'x'
order by conname;
-- Expected: venue_slots_no_live_overlap, an EXCLUDE USING gist over
-- (court_id WITH =, tstzrange(starts_at, ends_at, '[)') WITH &&) WHERE (status <>
-- 'blocked'). This constraint, not the trigger, is the overlap guarantee: it holds for
-- the applied SQL23/SQL40 write paths and any future one.

select
  tgname,
  tgenabled,
  tgtype
from pg_trigger
where tgrelid = 'public.venue_slots'::regclass
  and not tgisinternal
order by tgname;
-- Expected: venue_slot_overlap_beta present and enabled ('O').

select
  relname,
  relrowsecurity as rls_enabled
from pg_class
where oid = 'public.venue_booking_coordination'::regclass;
-- Expected: rls_enabled true.

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename = 'venue_booking_coordination'
order by policyname;
-- Expected: exactly one SELECT policy for authenticated, gated on
-- venue_booking_participant_beta. No INSERT/UPDATE/DELETE policy may exist: every
-- mutation must go through coordinate_venue_booking_beta.

select
  has_table_privilege('anon', 'public.venue_booking_coordination', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.venue_booking_coordination', 'insert') as authenticated_insert,
  has_table_privilege('authenticated', 'public.venue_booking_coordination', 'update') as authenticated_update,
  has_table_privilege('authenticated', 'public.venue_booking_coordination', 'select') as authenticated_select;
-- Expected: anon_select false, insert false, update false, select true.

select
  count(*) as overlapping_live_slot_pairs
from public.venue_slots a
join public.venue_slots b
  on a.court_id = b.court_id and a.id < b.id
 and a.status <> 'blocked' and b.status <> 'blocked'
 and a.starts_at < b.ends_at and b.starts_at < a.ends_at;
-- Expected: 0, both immediately after the apply and on any later audit.

select
  (select count(*) from public.venue_slots) as slots,
  (select count(*) from public.venue_booking_requests) as bookings,
  (select count(*) from public.venue_booking_coordination) as coordination_rows;
-- Expected: slots and bookings unchanged by the apply; coordination_rows 0.
