-- Read-only postcheck for SQL47. Run only against project hivedzrwrrcnjrlirhtv.
select
  to_regclass('public.coach_attestations') is not null as has_table,
  to_regclass('public.coach_verified_fields') is not null as has_field_level_table,
  to_regprocedure('public.manage_coach_beta(text,uuid,jsonb)') is not null as has_manage,
  to_regprocedure('public.attest_coach_claim_beta(uuid,jsonb)') is not null as has_attest,
  to_regprocedure('public.respond_coach_attestation_beta(uuid,text)') is not null as has_respond,
  to_regprocedure('public.coach_owns_team_beta(uuid)') is not null as has_scope_helper;
-- Expected: all true.

select
  p.proname,
  p.prosecdef as is_security_definer,
  p.proconfig as settings
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('manage_coach_beta', 'attest_coach_claim_beta',
                    'respond_coach_attestation_beta', 'coach_owns_team_beta')
order by p.proname;
-- Expected: every row is_security_definer true and settings contains search_path=
-- (empty). A non-empty search_path means STOP.

select
  p.proname,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('manage_coach_beta', 'attest_coach_claim_beta',
                    'respond_coach_attestation_beta', 'coach_owns_team_beta')
order by p.proname;
-- Expected: anon false, service_role false, authenticated true, for all four.

select
  relname,
  relrowsecurity as rls_enabled
from pg_class
where oid in ('public.coach_attestations'::regclass, 'public.coach_verified_fields'::regclass)
order by relname;
-- Expected: rls_enabled true for both.

select policyname, cmd, roles, qual
from pg_policies
where schemaname = 'public' and tablename in ('coach_attestations', 'coach_verified_fields')
order by tablename, policyname;
-- Expected: exactly one SELECT policy per table, for authenticated, restricted to the
-- coach, the athlete or an admin. No INSERT/UPDATE/DELETE policy may exist.

select
  has_table_privilege('anon', 'public.coach_attestations', 'select') as anon_select,
  has_table_privilege('authenticated', 'public.coach_attestations', 'select') as authenticated_select,
  has_table_privilege('authenticated', 'public.coach_attestations', 'insert') as authenticated_insert,
  has_table_privilege('authenticated', 'public.coach_attestations', 'update') as authenticated_update,
  has_table_privilege('service_role', 'public.coach_attestations', 'select') as service_role_select;
-- Expected: only authenticated_select true.

select
  count(*) as attestation_rows,
  count(*) filter (where status = 'accepted') as accepted_rows,
  count(*) filter (where status = 'accepted' and provenance_id is null) as accepted_without_provenance
from public.coach_attestations;
-- Expected right after the apply: all zero. On a later audit,
-- accepted_without_provenance must stay 0 -- an acceptance always records provenance.

select
  field,
  verified_value,
  count(*) as rows
from public.coach_verified_fields
group by field, verified_value
order by field, verified_value;
-- Expected: field is always 'playing_position' and verified_value is always one of
-- GK/DF/MF/FW. Any other pair means the structured claim was bypassed.

select
  count(*) as accepted_attestations_without_a_field_row
from public.coach_attestations a
where a.status = 'accepted'
  and not exists (select 1 from public.coach_verified_fields f where f.attestation_id = a.id);
-- Expected: 0. Every acceptance must have recorded exactly what was verified.

select
  count(*) as coach_verified_rows_without_accepted_attestation
from public.data_provenance p
where p.subject_type = 'athlete_profile'
  and p.verification_method = 'coach_attestation:playing_position'
  and not exists (
    select 1 from public.coach_attestations a
    where a.provenance_id = p.id and a.status = 'accepted' and a.athlete_id = p.subject_id
  );
-- Expected: 0. Every coach_verified row from this path must trace back to an
-- attestation the athlete themselves accepted.

select
  (select count(*) from public.coach_verified_fields) as field_level_rows,
  (select count(*) from public.team_members) as team_members,
  (select count(*) from public.data_provenance) as provenance_rows,
  (select count(*) from public.verification_events) as verification_events;
-- Expected: unchanged by the apply. SQL47 creates no membership, provenance or event.

-- PDPA erasure extension ------------------------------------------------------------
-- Retention statement to record with this apply: a coach attestation, the field-level
-- verification it produced, and the provenance, evidence and history rows directly
-- derived from it are audit records RETAINED ONLY UNTIL THE DATA SUBJECT EXERCISES
-- THEIR PDPA DELETION RIGHT. Records about other athletes are never erased by another
-- athlete's request, including attestations an erasing account wrote as a coach.

select
  p.proname,
  p.prosecdef as is_security_definer,
  p.proconfig as settings,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('delete_my_athlete_data', 'prevent_data_trust_history_mutation')
order by p.proname;
-- Expected: delete_my_athlete_data is_security_definer true, settings contains an empty
-- search_path (SQL36 restated after CREATE OR REPLACE), anon false, service_role false,
-- authenticated true. prevent_data_trust_history_mutation must be executable by NO
-- browser role: anon, authenticated and service_role all false.

select
  tgname,
  tgenabled,
  tgtype
from pg_trigger
where tgrelid = 'public.verification_events'::regclass
  and not tgisinternal
order by tgname;
-- Expected: verification_events_append_only still present and enabled ('O'). SQL47
-- replaced the guard function body, not the trigger.

select
  prosrc like '%bds.pdpa_erasure%' as guard_reads_erasure_flag,
  prosrc like '%old.subject_id = auth.uid()%' as guard_scopes_to_the_caller,
  prosrc like '%DATA_TRUST_HISTORY_APPEND_ONLY%' as guard_still_refuses_everything_else
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'prevent_data_trust_history_mutation';
-- Expected: all three true. The guard may yield only to a DELETE inside a flagged
-- erasure transaction, for rows whose subject is the calling user.

select
  prosrc like '%coach_attestations%' as deletion_clears_attestations,
  prosrc like '%coach_verified_fields%' as deletion_clears_field_level_rows,
  prosrc like '%coach_attestation:playing_position%' as deletion_scopes_provenance,
  prosrc like '%account_deletion_requests%' as deletion_still_files_the_request,
  prosrc like '%ATHLETE REMOVED%' as deletion_still_anonymises_ranks
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'delete_my_athlete_data';
-- Expected: all five true. The last two prove the applied SQL16 behaviour survived the
-- replacement rather than being dropped.

select
  count(*) as orphaned_field_rows
from public.coach_verified_fields f
where not exists (select 1 from public.coach_attestations a where a.id = f.attestation_id);
-- Expected: 0, both after the apply and on any later audit. An erasure removes the
-- attestation and its field row together.

select
  count(*) as coach_provenance_without_a_field_row
from public.data_provenance p
where p.verification_method = 'coach_attestation:playing_position'
  and not exists (select 1 from public.coach_verified_fields f where f.provenance_id = p.id);
-- Expected: 0. An erasure removes the provenance row and the field row together, so a
-- provenance row left behind means the deletion path did not run to completion.
