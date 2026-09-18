-- Read-only precheck for SQL46. Run only against project hivedzrwrrcnjrlirhtv.
-- A passing result authorises nothing. SQL46 needs separate explicit owner approval,
-- and every result set below must be recorded and reviewed before that decision.

-- 1. The exclusion constraint needs a gist operator class for uuid, which btree_gist
-- supplies. Supabase does not document btree_gist on its extensions page, and the
-- extension may live in public, extensions, or an operator-chosen schema. SQL46
-- resolves the pair from the catalog, so record what it will resolve to.
select
  exists (select 1 from pg_extension where extname = 'btree_gist') as btree_gist_installed,
  (select n.nspname
     from pg_extension e join pg_namespace n on n.oid = e.extnamespace
    where e.extname = 'btree_gist') as btree_gist_schema,
  (select count(*) from pg_opclass oc join pg_am am on am.oid = oc.opcmethod
    where am.amname = 'gist' and oc.opcintype = 'uuid'::regtype) as gist_uuid_opclass_count;
-- Expected: btree_gist_installed true, btree_gist_schema recorded (do NOT assume
-- public or extensions), gist_uuid_opclass_count exactly 1.
-- If installed is false: STOP. Run `create extension btree_gist with schema extensions;`
-- as a separate approved step, then re-run this precheck. Never relax SQL46's guard.
-- If the count is above 1: STOP. SQL46 picks the default first, then the lowest schema
-- name, and an ambiguous catalog must be reconciled by a human first.

select
  n.nspname as opclass_schema,
  oc.opcname as opclass_name,
  oc.opcdefault as is_default,
  am.amname as access_method
from pg_opclass oc
join pg_am am on am.oid = oc.opcmethod
join pg_namespace n on n.oid = oc.opcnamespace
where am.amname = 'gist' and oc.opcintype = 'uuid'::regtype
order by oc.opcdefault desc, n.nspname;
-- Expected: exactly one row. Record opclass_schema and opclass_name: SQL46 emits a
-- NOTICE naming the pair it used, and the two must match.

-- 2. Adding an exclusion constraint builds a GiST index and takes an ACCESS EXCLUSIVE
-- lock on public.venue_slots for the duration. Review the size before choosing a
-- window; bookings and slot writes block while it runs.
select
  (select count(*) from public.venue_slots) as venue_slots_rows,
  pg_size_pretty(pg_total_relation_size('public.venue_slots')) as venue_slots_total_size,
  pg_total_relation_size('public.venue_slots') as venue_slots_total_bytes,
  (select count(*) from public.venue_slots where starts_at > now()) as future_slots;
-- Expected for closed beta: a small table where the index build and its lock are
-- brief. If venue_slots_rows is large, agree a maintenance window first.
select
  to_regclass('public.venue_slots') is not null as has_sql23_slots,
  to_regprocedure('public.request_venue_booking_safely(uuid,text,text)') is not null as has_sql40_request,
  to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null as has_notification_entry,
  to_regclass('public.venue_booking_coordination') is null as coordination_absent,
  to_regprocedure('public.manage_venue_beta(text,uuid,jsonb)') is null as manage_absent;
-- Expected before SQL46: first three true, last two true (nothing applied yet).
-- Any *_absent false means STOP and reconcile; do not apply twice.

-- SQL46 refuses to run while overlapping live availability exists. Listing them here
-- lets the owner reconcile deliberately instead of the migration failing blind.
select
  a.court_id,
  a.id as slot_a,
  b.id as slot_b,
  a.starts_at as a_starts,
  a.ends_at as a_ends,
  b.starts_at as b_starts,
  b.ends_at as b_ends,
  a.status as a_status,
  b.status as b_status
from public.venue_slots a
join public.venue_slots b
  on a.court_id = b.court_id and a.id < b.id
 and a.status <> 'blocked' and b.status <> 'blocked'
 and a.starts_at < b.ends_at and b.starts_at < a.ends_at
order by a.court_id, a.starts_at;
-- Expected: zero rows. Every row must be resolved by the venue owner before applying;
-- never delete or shift a slot that has a pending or confirmed booking.

select
  count(*) as live_bookings_on_overlapping_slots
from public.venue_booking_requests r
where r.status in ('pending', 'confirmed')
  and exists (
    select 1 from public.venue_slots a join public.venue_slots b
      on a.court_id = b.court_id and a.id < b.id
     and a.status <> 'blocked' and b.status <> 'blocked'
     and a.starts_at < b.ends_at and b.starts_at < a.ends_at
    where r.slot_id in (a.id, b.id)
  );
-- Expected: 0. A non-zero count means reconciliation touches a real booking: STOP and
-- agree the resolution with the affected venue owner and requester first.

select
  count(*) as overlapping_live_slot_pairs
from public.venue_slots a
join public.venue_slots b
  on a.court_id = b.court_id and a.id < b.id
 and a.status <> 'blocked' and b.status <> 'blocked'
 and a.starts_at < b.ends_at and b.starts_at < a.ends_at;
-- Expected: 0. The constraint creation fails if this is above 0, and SQL46's own guard
-- raises EXISTING_SLOT_OVERLAP first so the failure is readable.

select
  status,
  count(*) as slots
from public.venue_slots
group by status
order by status;
-- Informational rollback baseline: record these counts before applying.
