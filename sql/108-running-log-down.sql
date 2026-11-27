-- Rollback of SQL108, either project, as postgres: delete_my_athlete_data back to SQL47's, word
-- for word, and the running tables and functions gone. It drops every logged run and goal.
begin;

-- SQL47's function, word for word.
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

revoke all on function public.delete_my_athlete_data() from public, anon, service_role;
grant execute on function public.delete_my_athlete_data() to authenticated;

drop function if exists public.my_run_weeks(integer);
drop function if exists public.set_my_run_goal(text, integer);
drop function if exists public.add_my_run(uuid, date, integer, integer);
drop table if exists public.run_goals;
drop table if exists public.run_logs;

commit;
