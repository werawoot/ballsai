-- Sandbox only for SQL108. Never run on Staging or Production: it creates roles, schemas, tables
-- and rows. In an empty local Postgres 16 or 17 database, run in order:
--   psql -d <db> -f sql/checks/101-sandbox-base.sql
--   psql -d <db> -f sql/checks/106-sandbox-base.sql
--   psql -d <db> -f sql/checks/108-sandbox-base.sql
--   psql -d <db> -f sql/checks/108-sandbox-test.sql      (before SQL108: 11 of 18 not true)
--   psql -d <db> -f sql/108-running-log-v1.sql
--   psql -d <db> -f sql/checks/108-sandbox-test.sql      (after: 18 of 18 true)
-- auth.users, and stand-ins for what delete_my_athlete_data (SQL47, word for word in SQL108) touches,
-- with the columns it uses, as both projects have them.
create table auth.users (id uuid primary key);
insert into auth.users values ('00000000-0000-4000-8000-00000000000b'), ('00000000-0000-4000-8000-00000000009a'), ('00000000-0000-4000-8000-00000000009b'), ('00000000-0000-4000-8000-000000000077'), ('00000000-0000-4000-8000-0000000000c1');
alter table public.profiles add column email text, add column full_name text, add column phone text, add column province text, add column team text, add column position text,
  add column onboarding_persona text, add column onboarding_sport text, add column onboarding_goal text, add column updated_at timestamptz;
insert into public.profiles (id, role) values ('00000000-0000-4000-8000-00000000000b', 'player') on conflict do nothing;
create table public.athlete_highlights (id uuid primary key default gen_random_uuid(), athlete_id uuid, media_path text);
create table public.player_ranks (id uuid primary key default gen_random_uuid(), player_id uuid, player_name text);
create table public.data_provenance (id uuid primary key default gen_random_uuid(), subject_type text, subject_id uuid, verification_method text);
create table public.verification_events (id uuid primary key default gen_random_uuid(), subject_type text, subject_id uuid, provenance_id uuid);
create table public.coach_verified_fields (id uuid primary key default gen_random_uuid(), athlete_id uuid);
create table public.coach_attestations (id uuid primary key default gen_random_uuid(), athlete_id uuid);
create table public.account_deletion_requests (user_id uuid primary key, email text, requested_at timestamptz default now(), completed_at timestamptz, completed_by uuid);

-- SQL47's delete_my_athlete_data, word for word, as both projects have it (fingerprint 5957a694).
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
revoke all on function public.delete_my_athlete_data() from public, anon;
grant execute on function public.delete_my_athlete_data() to authenticated;
grant select, insert, update, delete on public.profiles, public.athlete_highlights, public.player_ranks to authenticated;
