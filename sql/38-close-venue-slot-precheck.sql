-- 38-close-venue-slot-precheck.sql
--
-- READ-ONLY pre-apply check for sql/38-close-venue-slot-v1.sql.
-- THIS IS NOT A MIGRATION. It creates nothing and changes nothing: every statement is
-- a SELECT. There is no INSERT/UPDATE/DELETE/CREATE/ALTER/DROP and no RPC call.
--
-- Target project: hivedzrwrrcnjrlirhtv
-- BEFORE PASTING: confirm the Supabase dashboard URL contains that project ref.
-- This file cannot verify the ref for you — Supabase reports the same
-- current_database() ('postgres') on every project.
--
-- Run each block, record the output, and compare with the "EXPECTED" comment.
-- A full set of matching results is a NECESSARY condition for applying SQL38, never
-- a sufficient one and never an authorisation. Applying any migration remains a
-- separate, explicitly approved action by the production owner.

-- ---------------------------------------------------------------------------
-- A1. SQL23 venue tables exist and have RLS enabled.
-- EXPECTED: exactly 4 rows, rls_enabled = true on all 4.
-- If 0 rows: the SQL23 venue schema is not present on this project. STOP. Do not
-- apply SQL23, SQL24 or SQL38. Reconcile the recorded migration state against the
-- database and obtain explicit production approval from the owner for each migration
-- before anything is applied.
-- ---------------------------------------------------------------------------
select
  'A1 venue tables' as check_id,
  c.relname         as table_name,
  c.relrowsecurity  as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('venue_profiles', 'venue_courts', 'venue_slots', 'venue_booking_requests')
order by c.relname;

-- ---------------------------------------------------------------------------
-- A2. SQL23 RLS policies are present.
-- EXPECTED: exactly 4 rows —
--   venue_bookings_select_participants      on venue_booking_requests
--   venue_courts_select_published_or_owner  on venue_courts
--   venue_profiles_select_published_or_owner on venue_profiles
--   venue_slots_select_published_or_owner   on venue_slots
-- All four are SELECT ('r') policies. Fewer rows means SQL23 is incomplete: STOP and
-- report, rather than applying anything to repair it.
-- ---------------------------------------------------------------------------
select
  'A2 venue policies' as check_id,
  p.tablename,
  p.policyname,
  p.cmd,
  p.roles
from pg_policies p
where p.schemaname = 'public'
  and p.tablename in ('venue_profiles', 'venue_courts', 'venue_slots', 'venue_booking_requests')
order by p.tablename, p.policyname;

-- ---------------------------------------------------------------------------
-- A3. The guard that makes closing safe: one live booking per slot.
-- EXPECTED: 1 row, venue_booking_requests_live_slot_idx, is_unique = true,
--           is_partial = true.
-- Without this index the "no orphaned booking" argument in SQL38 is weaker.
-- ---------------------------------------------------------------------------
select
  'A3 live booking index' as check_id,
  i.relname   as index_name,
  x.indisunique as is_unique,
  x.indpred is not null as is_partial,
  pg_get_indexdef(x.indexrelid) as definition
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'venue_booking_requests'
  and i.relname = 'venue_booking_requests_live_slot_idx';

-- ---------------------------------------------------------------------------
-- A4. venue_slots.status must accept 'blocked' — SQL38 writes that value.
-- EXPECTED: 1 row whose definition contains both 'open' and 'blocked'.
-- ---------------------------------------------------------------------------
select
  'A4 status constraint' as check_id,
  con.conname,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class t on t.oid = con.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname = 'venue_slots'
  and con.contype = 'c';

-- ---------------------------------------------------------------------------
-- B1. public.is_admin() exists (from sql/supabase-rls.sql, step 3).
-- EXPECTED: 1 row, security_definer = true.
-- SQL38 calls it for the admin-override branch.
-- ---------------------------------------------------------------------------
select
  'B1 is_admin' as check_id,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(no search_path set)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'is_admin';

-- ---------------------------------------------------------------------------
-- B2. SQL35 audit entry point exists with the exact signature SQL38 calls.
-- EXPECTED: 1 row —
--   audit.write_admin_event(text, text, text, text, jsonb, jsonb),
--   security_definer = true, config contains search_path=.
-- If 0 rows: SQL35 is not applied here. Do NOT apply SQL38; its own guard
-- will refuse anyway.
-- ---------------------------------------------------------------------------
select
  'B2 audit.write_admin_event' as check_id,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(no search_path set)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'audit' and p.proname = 'write_admin_event';

-- ---------------------------------------------------------------------------
-- B3. SQL35 audit table exists and is admin-read-only.
-- EXPECTED: 1 row for admin_audit_logs with rls_enabled = true,
--           and 1 policy admin_audit_logs_admin_select (cmd = 'r').
-- ---------------------------------------------------------------------------
select
  'B3 admin_audit_logs' as check_id,
  c.relrowsecurity as rls_enabled,
  (select count(*) from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'admin_audit_logs') as policy_count,
  (select string_agg(p.policyname || ' (' || p.cmd || ')', ', ')
     from pg_policies p
    where p.schemaname = 'public' and p.tablename = 'admin_audit_logs') as policies
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'admin_audit_logs';

-- ---------------------------------------------------------------------------
-- C1. close_venue_slot_safely must NOT exist yet.
-- EXPECTED: 0 rows.
-- If 1 row: SQL38 (or an earlier draft of it) already ran here. STOP and
-- report before applying — the SQLSTATE values and the audit branch changed,
-- so an older copy is not equivalent. Compare `definition` with the file.
-- ---------------------------------------------------------------------------
select
  'C1 close_venue_slot_safely (must be absent)' as check_id,
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'close_venue_slot_safely';

-- ---------------------------------------------------------------------------
-- D1. Recorded EXECUTE grantees on the SQL23 venue RPCs.
-- EXPECTED: for every function, grantees are `authenticated` and the owning
--           role only. `anon` and `service_role` must NOT appear.
-- This is the same least-privilege shape SQL33/SQL34 were verified against and
-- the shape SQL38 asserts for itself.
-- Read via aclexplode so a missing function simply yields no row instead of
-- raising an error.
-- ---------------------------------------------------------------------------
select
  'D1 venue rpc grants' as check_id,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  coalesce(grantee.rolname, 'PUBLIC') as grantee,
  acl.privilege_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) acl on true
left join pg_roles grantee on grantee.oid = acl.grantee
where n.nspname = 'public'
  and p.proname in (
    'create_venue_profile_safely',
    'create_venue_court_safely',
    'create_venue_slot_safely',
    'request_venue_booking_safely',
    'respond_venue_booking_safely',
    'cancel_venue_booking_safely'
  )
  and acl.privilege_type = 'EXECUTE'
order by p.proname, grantee;

-- ---------------------------------------------------------------------------
-- D2. Which of the six SQL23 venue RPCs exist at all.
-- EXPECTED: 6 rows. Fewer means SQL23 was applied partially: STOP and report. Do not
-- re-apply SQL23 to fill the gap without explicit production approval.
-- ---------------------------------------------------------------------------
select
  'D2 venue rpc presence' as check_id,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '(no search_path set)') as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_venue_profile_safely',
    'create_venue_court_safely',
    'create_venue_slot_safely',
    'request_venue_booking_safely',
    'respond_venue_booking_safely',
    'cancel_venue_booking_safely'
  )
order by p.proname;

-- ---------------------------------------------------------------------------
-- E1. Blast-radius counts. Aggregates only — no athlete, guardian, owner or
-- requester identity is selected.
-- EXPECTED during closed beta: small numbers, very likely all zero.
-- `open_slots_with_live_booking` is the population SQL38 will refuse to close;
-- it is informational, not a blocker.
-- ---------------------------------------------------------------------------
select
  'E1 venue data shape' as check_id,
  (select count(*) from public.venue_profiles) as venues,
  (select count(*) from public.venue_courts) as courts,
  (select count(*) from public.venue_slots) as slots,
  (select count(*) from public.venue_slots where status = 'open') as open_slots,
  (select count(*) from public.venue_slots where status = 'blocked') as blocked_slots,
  (select count(*) from public.venue_booking_requests) as booking_requests,
  (select count(*) from public.venue_booking_requests
     where status in ('pending', 'confirmed')) as live_booking_requests,
  (select count(*) from public.venue_slots s
    where s.status = 'open'
      and exists (
        select 1 from public.venue_booking_requests b
        where b.slot_id = s.id and b.status in ('pending', 'confirmed')
      )) as open_slots_with_live_booking;
