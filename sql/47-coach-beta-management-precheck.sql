-- Read-only precheck for SQL47. Run only against project hivedzrwrrcnjrlirhtv.
-- A passing result authorises nothing. SQL47 needs separate explicit owner approval.
select
  to_regclass('public.teams') is not null as has_teams,
  to_regclass('public.team_members') is not null as has_team_members,
  to_regclass('public.data_provenance') is not null as has_sql31_provenance,
  to_regclass('public.verification_events') is not null as has_sql31_events,
  to_regclass('public.verification_evidence') is not null as has_sql31_evidence,
  to_regprocedure('public.is_admin()') is not null as has_is_admin,
  to_regclass('public.coach_attestations') is null as attestations_absent,
  to_regclass('public.coach_verified_fields') is null as verified_fields_absent,
  to_regprocedure('public.manage_coach_beta(text,uuid,jsonb)') is null as manage_absent;
-- Expected before SQL47: the first six true, and every *_absent true.
-- Any *_absent false means STOP and reconcile; do not apply twice.

select
  count(*) as teams_without_creator
from public.teams
where created_by is null;
-- SQL47 authorises a coach solely by teams.created_by. A non-zero count means those
-- teams would have no coach at all: decide their owner before applying.

select
  count(*) as draft_teams,
  count(*) filter (where status <> 'draft') as non_draft_teams
from public.teams;
-- Informational: SQL47 only permits member removal on a draft team.

select
  verification_level,
  count(*) as provenance_rows
from public.data_provenance
group by verification_level
order by verification_level;
-- Rollback baseline. SQL47 itself creates no provenance row; only an athlete accepting
-- an attestation does. Record these counts before applying.

select
  count(*) as existing_coach_verified_athlete_rows
from public.data_provenance
where subject_type = 'athlete_profile' and verification_level = 'coach_verified';
-- Expected to be unchanged by the apply itself.

select
  count(*) as athletes_with_a_position_on_file
from public.athlete_profiles
where position is not null and btrim(position) <> '';
-- Informational. SQL47 confirms the playing_position FIELD only; it does not read,
-- write or reconcile athlete_profiles.position. Nothing here becomes coach_verified
-- until an athlete accepts an attestation.

-- PDPA deletion function identity and drift check -----------------------------------
-- SQL47 extends public.delete_my_athlete_data() by replacing it. Record every field
-- below and compare the fingerprint against the value SQL47 expects. A mismatch means
-- production has drifted from sql/data-deletion-v1.sql and requires MANUAL
-- RECONCILIATION by a human; it is NOT permission to overwrite the function, and
-- SQL47 will abort before replacing anything.
select
  p.oid::regprocedure as function_identity,
  pg_get_userbyid(p.proowner) as function_owner,
  p.prosecdef as is_security_definer,
  p.proconfig as settings,
  md5(p.prosrc) as prosrc_fingerprint,
  length(p.prosrc) as prosrc_length,
  md5(p.prosrc) = 'c417f309449e0ab60c41daab57f87d74' as fingerprint_matches_expected,
  length(p.prosrc) = 1369 as length_matches_expected
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_my_athlete_data';
-- Expected: exactly one row; function_identity
-- public.delete_my_athlete_data(); is_security_definer true; settings containing an
-- empty search_path (SQL36); prosrc_fingerprint c417f309449e0ab60c41daab57f87d74;
-- prosrc_length 1369; both *_matches_expected true.
-- Record function_owner: SQL47 replaces the function, and a SECURITY DEFINER function
-- runs as its owner, so an unexpected owner is itself drift to reconcile.

select
  has_function_privilege('anon', 'public.delete_my_athlete_data()', 'execute') as anon_can_execute,
  has_function_privilege('authenticated', 'public.delete_my_athlete_data()', 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', 'public.delete_my_athlete_data()', 'execute') as service_role_can_execute;
-- Expected, per SQL33 and SQL36: anon false, service_role false, authenticated true.
-- SQL47 restates these after the replacement and asserts them before committing.

select
  p.proname,
  p.prosecdef as is_security_definer,
  p.proconfig as settings,
  md5(p.prosrc) as prosrc_fingerprint
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'prevent_data_trust_history_mutation';
-- Expected: one row, is_security_definer false (SQL31 made it invoker), settings with an
-- empty search_path. SQL47 replaces this body too, so record the current fingerprint as
-- the rollback reference.
