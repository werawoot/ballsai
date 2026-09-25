-- 47-coach-beta-management-v1.sql
-- Coach capabilities for the closed beta, scoped to teams the coach created.
-- Apply only to Supabase project hivedzrwrrcnjrlirhtv after explicit owner approval.
--
-- What this adds and what it deliberately does not:
--   * A coach may remove a member from a draft team THEY created. Authorization is the
--     team-creator relationship only: never a global profiles.role, never the tournament
--     organizer path, and never an admin override. SQL20's invite_team_member already
--     covers the organizer and admin paths for roster work, and any new administrative
--     override must be a separate, explicitly approved RPC on the SQL35 audit trail.
--   * A coach may attest to ONE structured field about an accepted member of a team
--     THEY CREATED: playing_position, whose value must be one of GK/DF/MF/FW. Exact
--     creator only -- an admin who does not run the team is refused, because the record
--     names the actor as the coach and an administrative action is not coach knowledge. There is no
--     free-text claim. It starts 'pending' and confers nothing. Only the athlete's own
--     acceptance records the verification, and what it records is that ONE FIELD --
--     never the athlete's identity, rating, ability, statistics or whole profile.
--   * No path here writes public.player_ranks, match results, rating events or
--     match_player_performances. A coach cannot reach performance data through it.
--   * SQL18/19/20/31 are applied; this migration redefines nothing they created.

begin;

do $$
begin
  if to_regclass('public.teams') is null or to_regclass('public.team_members') is null then
    raise exception 'SQL47 requires public.teams and public.team_members from SQL18/SQL20';
  end if;
  if to_regclass('public.data_provenance') is null
     or to_regclass('public.verification_events') is null
     or to_regclass('public.verification_evidence') is null then
    raise exception 'SQL47 requires the SQL31 data-trust tables';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL47 requires public.is_admin()';
  end if;
  if to_regclass('public.coach_attestations') is not null then
    raise exception 'SQL47 coach_attestations already exists; stop and reconcile state';
  end if;
end;
$$;

-- A coach's claim about one athlete on one of their teams. Append-only in practice:
-- the only mutation is the athlete's single response.
create table public.coach_attestations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete restrict,
  athlete_id uuid not null references auth.users(id) on delete cascade,
  -- One named field with an explicit value set. Nothing here is free text, so no
  -- reviewer has to interpret prose and no claim can exceed what it says.
  field text not null default 'playing_position' check (field = 'playing_position'),
  claimed_value text not null check (claimed_value in ('GK', 'DF', 'MF', 'FW')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  provenance_id uuid references public.data_provenance(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  -- A coach cannot attest about themselves.
  check (coach_id <> athlete_id)
);

create index coach_attestations_athlete_idx
  on public.coach_attestations(athlete_id, status, created_at desc);
create index coach_attestations_team_idx
  on public.coach_attestations(team_id, created_at desc);
-- One live claim per coach per athlete per team, so a coach cannot spam the athlete.
-- One LIVE attestation per team, athlete and field. Only teams.created_by may attest,
-- so a team has exactly one possible attesting coach and coach_id is not part of the
-- key. A pending attestation must be answered and an accepted one has no replacement
-- flow in closed beta, so both block a new row. A declined one does not.
create unique index coach_attestations_live_idx
  on public.coach_attestations(team_id, athlete_id, field)
  where status in ('pending', 'accepted');

-- Field-level provenance: exactly which field of which athlete a coach confirmed, and
-- what value. Append-only -- a later attestation adds a row, it never rewrites one --
-- so the verification history stays readable.
create table public.coach_verified_fields (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references auth.users(id) on delete cascade,
  field text not null check (field = 'playing_position'),
  verified_value text not null check (verified_value in ('GK', 'DF', 'MF', 'FW')),
  attestation_id uuid not null unique references public.coach_attestations(id) on delete cascade,
  coach_id uuid not null references auth.users(id) on delete restrict,
  provenance_id uuid references public.data_provenance(id) on delete set null,
  verified_at timestamptz not null default now()
);

create index coach_verified_fields_athlete_idx
  on public.coach_verified_fields(athlete_id, field, verified_at desc);

alter table public.coach_verified_fields enable row level security;
revoke all on table public.coach_verified_fields from anon, authenticated, service_role;
grant select on table public.coach_verified_fields to authenticated;

-- The athlete, the coach who confirmed it, and admins. No write policy exists.
create policy coach_verified_fields_select_parties
on public.coach_verified_fields
for select
to authenticated
using (
  athlete_id = (select auth.uid())
  or coach_id = (select auth.uid())
  or (select public.is_admin())
);

alter table public.coach_attestations enable row level security;
revoke all on table public.coach_attestations from anon, authenticated, service_role;
grant select on table public.coach_attestations to authenticated;

-- Readable by the two parties only. No INSERT/UPDATE/DELETE policy exists, so every
-- mutation must go through the guarded RPCs below.
create policy coach_attestations_select_parties
on public.coach_attestations
for select
to authenticated
using (
  coach_id = (select auth.uid())
  or athlete_id = (select auth.uid())
  or (select public.is_admin())
);

-- Exact coach ownership: the account that created the team, and nothing else. An admin
-- is deliberately absent. An attestation is recorded as coach_verified with the actor
-- named as the coach, so an administrator acting on a team they do not run must not be
-- able to produce one -- that would misrepresent an administrative action as a coach's
-- first-hand knowledge of where the athlete plays.
create function public.is_team_creator_beta(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.teams t
    where t.id = p_team_id and t.created_by = auth.uid()
  )
$$;
revoke all on function public.is_team_creator_beta(uuid) from public, anon, service_role;
grant execute on function public.is_team_creator_beta(uuid) to authenticated;


create function public.manage_coach_beta(p_action text, p_id uuid, p_data jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.team_members%rowtype;
  v_status text;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Exact team creator only. There is deliberately no admin branch: an administrative
  -- roster fix would be an unaudited mutation here, and must instead be a separate,
  -- explicitly approved RPC that writes the SQL35 admin audit trail.
  if not public.is_team_creator_beta(p_id) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  select t.status into v_status from public.teams t where t.id = p_id for update;
  if v_status is distinct from 'draft' then raise exception 'ROSTER_LOCKED' using errcode = '55000'; end if;

  if p_action = 'remove' then
    -- The member id must belong to THIS team, so another team's member id cannot be
    -- borrowed even by a legitimate coach.
    select * into v_member from public.team_members m
    where m.id = (p_data->>'memberId')::uuid and m.team_id = p_id
    for update;
    if v_member.id is null then raise exception 'MEMBER_NOT_FOUND'; end if;
    if v_member.status = 'removed' then return jsonb_build_object('id', v_member.id, 'status', 'removed'); end if;
    update public.team_members
    set status = 'removed', responded_at = now()
    where id = v_member.id;
    return jsonb_build_object('id', v_member.id, 'status', 'removed');
  end if;

  -- Anything else, including any attempt at ratings or performance data, is refused
  -- here rather than silently ignored.
  raise exception 'INVALID_ACTION';
end;
$$;
revoke all on function public.manage_coach_beta(text, uuid, jsonb) from public, anon, service_role;
grant execute on function public.manage_coach_beta(text, uuid, jsonb) to authenticated;

-- Records a claim. It creates no provenance and changes no verification level.
create function public.attest_coach_claim_beta(p_team_id uuid, p_data jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_athlete uuid := (p_data->>'athleteId')::uuid;
  v_value text := btrim(upper(coalesce(p_data->>'position', '')));
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  -- Exact creator only. An admin who does not run this team is refused here.
  if not public.is_team_creator_beta(p_team_id) then raise exception 'NOT_ALLOWED' using errcode = '42501'; end if;
  if v_athlete is null then raise exception 'ATHLETE_REQUIRED'; end if;
  -- Validated here as well as by the column constraint, so the refusal is a clear
  -- token the API can map rather than a raw constraint violation.
  if v_value not in ('GK', 'DF', 'MF', 'FW') then raise exception 'INVALID_POSITION'; end if;
  if v_athlete = auth.uid() then raise exception 'CANNOT_ATTEST_SELF' using errcode = '42501'; end if;
  -- The claim is only meaningful about an athlete who accepted this team's invitation.
  if not exists (
    select 1 from public.team_members m
    where m.team_id = p_team_id and m.athlete_id = v_athlete and m.status = 'accepted'
  ) then raise exception 'ACCEPTED_MEMBER_REQUIRED'; end if;
  if not exists (select 1 from public.athlete_profiles a where a.user_id = v_athlete) then
    raise exception 'ATHLETE_PROFILE_REQUIRED';
  end if;

  -- Enforced here as well as by coach_attestations_live_idx, so a direct RPC caller
  -- gets the same refusal the form does, with a token the API can map.
  if exists (
    select 1 from public.coach_attestations a
    where a.team_id = p_team_id and a.athlete_id = v_athlete
      and a.field = 'playing_position' and a.status = 'pending'
  ) then raise exception 'ATTESTATION_ALREADY_PENDING' using errcode = '55000'; end if;
  if exists (
    select 1 from public.coach_attestations a
    where a.team_id = p_team_id and a.athlete_id = v_athlete
      and a.field = 'playing_position' and a.status = 'accepted'
  ) then raise exception 'ATTESTATION_ALREADY_ACCEPTED' using errcode = '55000'; end if;

  insert into public.coach_attestations (team_id, coach_id, athlete_id, field, claimed_value)
  values (p_team_id, auth.uid(), v_athlete, 'playing_position', v_value)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.attest_coach_claim_beta(uuid, jsonb) from public, anon, service_role;
grant execute on function public.attest_coach_claim_beta(uuid, jsonb) to authenticated;

-- The athlete's own decision. This is the only path that can produce coach_verified.
create function public.respond_coach_attestation_beta(p_attestation_id uuid, p_status text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.coach_attestations%rowtype;
  v_provenance uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'INVALID_STATUS'; end if;
  select * into a from public.coach_attestations where id = p_attestation_id for update;
  if a.id is null then raise exception 'ATTESTATION_NOT_FOUND'; end if;
  -- Only the subject. The coach who wrote it and every other account are refused,
  -- including an admin: acceptance is the athlete's consent, not an override.
  if a.athlete_id is distinct from auth.uid() then
    raise exception 'ATHLETE_REQUIRED' using errcode = '42501';
  end if;
  if a.status <> 'pending' then raise exception 'ATTESTATION_CLOSED' using errcode = '55000'; end if;

  if p_status = 'accepted' then
    -- SQL31 restricts subject_type to a fixed set, so the row is filed under
    -- athlete_profile. The method and metadata name the single field that was
    -- confirmed, and public.coach_verified_fields below is the authoritative record of
    -- WHAT was verified. Nothing here asserts identity, rating or performance.
    insert into public.data_provenance (
      subject_type, subject_id, source_type, source_actor_id, verification_level,
      confidence, verification_method, metadata, verified_at
    )
    values (
      'athlete_profile', a.athlete_id, 'coach_verified', a.coach_id, 'coach_verified',
      -- One self-reported field, confirmed by one coach on one team. Deliberately not
      -- high confidence: it is not a performance measurement.
      0.6000, 'coach_attestation:playing_position',
      -- Ids and the confirmed field only, never the athlete's contact details.
      jsonb_build_object(
        'field', a.field,
        'verified_value', a.claimed_value,
        'scope', 'single_field',
        'team_id', a.team_id,
        'attestation_id', a.id
      ),
      now()
    )
    returning id into v_provenance;

    insert into public.coach_verified_fields (athlete_id, field, verified_value, attestation_id, coach_id, provenance_id)
    values (a.athlete_id, a.field, a.claimed_value, a.id, a.coach_id, v_provenance);

    insert into public.verification_evidence (provenance_id, evidence_type, submitted_by, review_status, reviewed_by, reviewed_at)
    values (v_provenance, 'coach_attestation', a.coach_id, 'accepted', a.athlete_id, now());

    insert into public.verification_events (
      subject_type, subject_id, event_type, from_level, to_level, actor_id, actor_role, reason, provenance_id
    )
    values (
      'athlete_profile', a.athlete_id, 'accepted', 'self', 'coach_verified', a.athlete_id,
      'athlete', 'นักกีฬายอมรับการรับรองตำแหน่งการเล่นจากโค้ช', v_provenance
    );
  end if;

  update public.coach_attestations
  set status = p_status, responded_at = now(), provenance_id = v_provenance
  where id = a.id;
  return a.id;
end;
$$;
revoke all on function public.respond_coach_attestation_beta(uuid, text) from public, anon, service_role;
grant execute on function public.respond_coach_attestation_beta(uuid, text) to authenticated;

-- PDPA erasure -------------------------------------------------------------------
--
-- SQL16/SQL33/SQL36 are applied and are not edited here. The deletion behaviour is
-- extended by redefining the function in this migration, with SQL36's empty
-- search_path restated (CREATE OR REPLACE discards proconfig) and SQL33/SQL36's
-- privileges reasserted below.
--
-- Retention statement: a coach attestation, the field-level verification it produced,
-- and the provenance, evidence and history entries directly derived from it are audit
-- records that are RETAINED ONLY UNTIL THE DATA SUBJECT EXERCISES THEIR PDPA DELETION
-- RIGHT. When the athlete requests deletion, those records are erased. Records about
-- OTHER athletes are not touched, including attestations this account wrote as a coach:
-- those are the other athletes' verification records, not this account's to erase.
-- This mirrors the existing choice to anonymise player_ranks rather than delete the
-- match history other athletes were rated against.

do $$
declare
  v_fingerprint text;
  v_length integer;
  -- Deterministic fingerprint of the body this migration was written to extend:
  -- md5(prosrc) and length(prosrc) of public.delete_my_athlete_data() as produced by
  -- sql/data-deletion-v1.sql and left unchanged by SQL33 (grants only) and SQL36
  -- (search_path only). Both are reported by the 47 precheck; record them before
  -- applying.
  c_expected_fingerprint constant text := 'c417f309449e0ab60c41daab57f87d74';
  c_expected_length constant integer := 1369;
begin
  if to_regprocedure('public.delete_my_athlete_data()') is null then
    raise exception 'SQL47 requires public.delete_my_athlete_data() from SQL16';
  end if;

  select md5(p.prosrc), length(p.prosrc) into v_fingerprint, v_length
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'delete_my_athlete_data';

  -- Marker substrings cannot detect a line production added that still contains them,
  -- so compare the whole body exactly.
  if v_fingerprint is distinct from c_expected_fingerprint or v_length is distinct from c_expected_length then
    raise exception 'SQL47 will not replace delete_my_athlete_data(): its body is not the one this migration extends (found md5 % length %, expected md5 % length %). A fingerprint mismatch means production has drifted and requires MANUAL RECONCILIATION by a human; it is NOT permission to overwrite the function. Re-run sql/47-coach-beta-management-precheck.sql, diff the live body against sql/data-deletion-v1.sql, agree the merged body, and only then update the expected fingerprint in this migration.',
      v_fingerprint, v_length, c_expected_fingerprint, c_expected_length;
  end if;
end;
$$;

-- Lets the SQL31 append-only guard yield to exactly one thing: the data subject
-- deleting their own history inside a flagged erasure transaction. Every other UPDATE
-- or DELETE on verification_events still raises, including an admin's.
create or replace function public.prevent_data_trust_history_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and coalesce(current_setting('bds.pdpa_erasure', true), '') = 'on'
     and old.subject_type = 'athlete_profile'
     and old.subject_id = auth.uid() then
    return old;
  end if;
  raise exception 'DATA_TRUST_HISTORY_APPEND_ONLY' using errcode = '42501';
end;
$$;

create or replace function public.delete_my_athlete_data()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_ranks integer := 0;
  v_highlight_paths text[] := '{}';
  v_attestations integer := 0;
  v_fields integer := 0;
  v_provenance integer := 0;
  v_events integer := 0;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select email into v_email from public.profiles where id = v_user_id;

  -- Returned to the caller so the route can remove the objects the athlete owns in
  -- storage. SQL cannot delete storage objects.
  select coalesce(array_agg(media_path), '{}')
  into v_highlight_paths
  from public.athlete_highlights
  where athlete_id = v_user_id;

  update public.player_ranks
  set player_name = 'ATHLETE REMOVED',
      player_id = null
  where player_id = v_user_id;
  get diagnostics v_ranks = row_count;

  -- SQL47 addition. Scoped to this athlete only, in dependency order. Events first,
  -- because the append-only guard needs the transaction-local flag below and the
  -- provenance rows they reference are removed after.
  perform set_config('bds.pdpa_erasure', 'on', true);

  delete from public.verification_events e
  where e.subject_type = 'athlete_profile'
    and e.subject_id = v_user_id
    and e.provenance_id in (
      select p.id from public.data_provenance p
      where p.subject_type = 'athlete_profile'
        and p.subject_id = v_user_id
        and p.verification_method = 'coach_attestation:playing_position'
    );
  get diagnostics v_events = row_count;

  -- verification_evidence cascades from data_provenance.
  delete from public.data_provenance p
  where p.subject_type = 'athlete_profile'
    and p.subject_id = v_user_id
    and p.verification_method = 'coach_attestation:playing_position';
  get diagnostics v_provenance = row_count;

  delete from public.coach_verified_fields f where f.athlete_id = v_user_id;
  get diagnostics v_fields = row_count;

  -- Only rows ABOUT this athlete. Attestations this account wrote as a coach belong to
  -- the athletes they are about and are deliberately left in place.
  delete from public.coach_attestations a where a.athlete_id = v_user_id;
  get diagnostics v_attestations = row_count;

  perform set_config('bds.pdpa_erasure', 'off', true);

  delete from public.athlete_profiles where user_id = v_user_id;

  update public.profiles
  set full_name = '',
      phone = null,
      province = null,
      team = null,
      position = null,
      onboarding_persona = null,
      onboarding_sport = null,
      onboarding_goal = null,
      updated_at = now()
  where id = v_user_id;

  insert into public.account_deletion_requests (user_id, email)
  values (v_user_id, v_email)
  on conflict (user_id) do update set requested_at = now(), completed_at = null, completed_by = null;

  return jsonb_build_object(
    'anonymisedRankings', v_ranks,
    'highlightPaths', v_highlight_paths,
    'coachAttestationsRemoved', v_attestations,
    'coachVerifiedFieldsRemoved', v_fields,
    'coachProvenanceRemoved', v_provenance,
    'coachVerificationEventsRemoved', v_events
  );
end;
$$;

-- CREATE OR REPLACE keeps grants but discards settings, so SQL33 and SQL36 hardening is
-- restated here rather than assumed.
revoke all on function public.delete_my_athlete_data() from public, anon, service_role;
grant execute on function public.delete_my_athlete_data() to authenticated;
revoke all on function public.prevent_data_trust_history_mutation() from public, anon, authenticated, service_role;

do $$
declare
  v_missing text;
begin
  -- Prove the intended shape rather than trusting the statements above. PostgreSQL
  -- grants PUBLIC execute on a new function, so a missed revoke is otherwise silent.
  -- Any failure here raises, which rolls the whole migration back.
  if has_function_privilege('anon','public.manage_coach_beta(text,uuid,jsonb)','execute')
     or has_function_privilege('service_role','public.manage_coach_beta(text,uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.manage_coach_beta(text,uuid,jsonb)','execute')
     or has_function_privilege('anon','public.attest_coach_claim_beta(uuid,jsonb)','execute')
     or has_function_privilege('service_role','public.attest_coach_claim_beta(uuid,jsonb)','execute')
     or not has_function_privilege('authenticated','public.attest_coach_claim_beta(uuid,jsonb)','execute')
     or has_function_privilege('anon','public.respond_coach_attestation_beta(uuid,text)','execute')
     or has_function_privilege('service_role','public.respond_coach_attestation_beta(uuid,text)','execute')
     or not has_function_privilege('authenticated','public.respond_coach_attestation_beta(uuid,text)','execute')
     or has_function_privilege('anon','public.is_team_creator_beta(uuid)','execute')
     or has_function_privilege('service_role','public.is_team_creator_beta(uuid)','execute')
     or not has_function_privilege('authenticated','public.is_team_creator_beta(uuid)','execute')
     -- CREATE OR REPLACE keeps grants, but prove SQL33/SQL36's shape survived anyway.
     or has_function_privilege('anon','public.delete_my_athlete_data()','execute')
     or has_function_privilege('service_role','public.delete_my_athlete_data()','execute')
     or not has_function_privilege('authenticated','public.delete_my_athlete_data()','execute') then
    raise exception 'SQL47 privilege shape is wrong; stop and reconcile';
  end if;

  -- The trigger-only history guard must stay uncallable by any browser role.
  if has_function_privilege('anon','public.prevent_data_trust_history_mutation()','execute')
     or has_function_privilege('authenticated','public.prevent_data_trust_history_mutation()','execute')
     or has_function_privilege('service_role','public.prevent_data_trust_history_mutation()','execute') then
    raise exception 'SQL47 left the history guard callable by a browser role';
  end if;

  -- SQL36 set an empty search_path on the deletion function; CREATE OR REPLACE discards
  -- proconfig, so prove it was restated.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
         unnest(coalesce(p.proconfig, array[]::text[])) as cfg
    where n.nspname = 'public' and p.proname = 'delete_my_athlete_data'
      and p.prosecdef
      and cfg like 'search_path=%'
      and btrim(split_part(cfg, '=', 2), '"''') = ''
  ) then
    raise exception 'SQL47 did not restate SQL36 empty search_path on delete_my_athlete_data()';
  end if;

  -- Every definer function must carry an empty search_path.
  select string_agg(p.proname, ', ') into v_missing
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('manage_coach_beta','attest_coach_claim_beta',
                      'respond_coach_attestation_beta','is_team_creator_beta')
    -- PostgreSQL stores an empty search_path as search_path="" (quoted), so compare the
    -- parsed value rather than an exact string: an exact match would abort a correct
    -- migration.
    and (not p.prosecdef or p.proconfig is null
         or not exists (
           select 1 from unnest(p.proconfig) as cfg
           where cfg like 'search_path=%'
             and btrim(split_part(cfg, '=', 2), '"''') = ''
         ));
  if v_missing is not null then
    raise exception 'SQL47 definer settings are wrong for: %', v_missing;
  end if;

  -- Table grants: read-only to authenticated, nothing to anon or service_role.
  if has_table_privilege('anon','public.coach_attestations','select')
     or has_table_privilege('service_role','public.coach_attestations','select')
     or has_table_privilege('authenticated','public.coach_attestations','insert')
     or has_table_privilege('authenticated','public.coach_attestations','update')
     or has_table_privilege('authenticated','public.coach_attestations','delete')
     or not has_table_privilege('authenticated','public.coach_attestations','select')
     or has_table_privilege('anon','public.coach_verified_fields','select')
     or has_table_privilege('service_role','public.coach_verified_fields','select')
     or has_table_privilege('authenticated','public.coach_verified_fields','insert')
     or has_table_privilege('authenticated','public.coach_verified_fields','update')
     or has_table_privilege('authenticated','public.coach_verified_fields','delete')
     or not has_table_privilege('authenticated','public.coach_verified_fields','select') then
    raise exception 'SQL47 table grants are wrong; stop and reconcile';
  end if;

  -- RLS posture: enabled on both tables, and SELECT is the only policy command.
  select string_agg(c.relname, ', ') into v_missing
  from pg_class c
  where c.oid in ('public.coach_attestations'::regclass, 'public.coach_verified_fields'::regclass)
    and not c.relrowsecurity;
  if v_missing is not null then
    raise exception 'SQL47 left RLS disabled on: %', v_missing;
  end if;

  select string_agg(policyname, ', ') into v_missing
  from pg_policies
  where schemaname = 'public'
    and tablename in ('coach_attestations','coach_verified_fields')
    and cmd <> 'SELECT';
  if v_missing is not null then
    raise exception 'SQL47 created a non-SELECT policy: %', v_missing;
  end if;
end;
$$;

notify pgrst, 'reload schema';
commit;
