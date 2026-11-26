-- Rollback of SQL107, either project, as postgres: my_profile_home back to SQL91's, word for word.
-- Run it only after SQL106's rollback (sql/106-athlete-weight-private-down.sql): with SQL106 in place,
-- SQL91's function cannot read the weight column and /profile fails.
begin;

do $$
begin
  if not has_column_privilege('authenticated', 'public.athlete_profiles', 'weight_kg', 'SELECT') then
    raise exception 'SQL107 rollback: roll back SQL106 first, or /profile fails';
  end if;
end;
$$;

-- SQL91's function, word for word.
create or replace function public.my_profile_home(p_sport text, p_season text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with active as (
    select e.id, e.program_id, e.weekdays, e.start_date, e.status
    from public.training_enrollments e
    where e.athlete_id = (select auth.uid()) and e.status = 'active'
    order by e.created_at desc
  )
  select jsonb_build_object(
    'profile', (select to_jsonb(p) from (
      select pr.full_name, pr.role, pr.onboarding_persona from public.profiles pr
      where pr.id = (select auth.uid())) p),
    -- The same public columns as lib/athlete-private.ts PUBLIC_PROFILE_COLUMNS.
    'athlete', (select to_jsonb(a) from (
      select ap.user_id, ap.display_name, ap.sport, ap.position, ap.province, ap.height_cm, ap.weight_kg,
             ap.current_team, ap.bio, ap.profile_image_url, ap.is_public, ap.verification_level,
             ap.verified_at, ap.created_at, ap.updated_at
      from public.athlete_profiles ap where ap.user_id = (select auth.uid())) a),
    'private', (select to_jsonb(x) from public.my_athlete_private() x limit 1),
    'rank', (select to_jsonb(r) from (
      select rk.id, rk.player_name, rk.position, rk.ovr, rk.pts from public.player_ranks rk
      where rk.player_id = (select auth.uid()) and rk.sport = p_sport and rk.season = p_season
      limit 1) r),
    'progress', (select to_jsonb(g) from (
      select pg.xp_total, pg.current_level from public.athlete_progress pg
      where pg.athlete_id = (select auth.uid())) g),
    'highlights', (select count(*) from public.athlete_highlights h where h.athlete_id = (select auth.uid())),
    'videos', (select count(*) from public.athlete_videos v where v.athlete_id = (select auth.uid())),
    'pending_guardian', (select count(*) from public.guardian_links gl
                         where gl.athlete_id = (select auth.uid()) and gl.status = 'pending'),
    'memberships', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from public.my_team_memberships(5) m),
    'training', jsonb_build_object(
      'enrollments', (select coalesce(jsonb_agg(to_jsonb(ac)), '[]'::jsonb) from active ac),
      'checkins', (select coalesce(jsonb_agg(jsonb_build_object('enrollment_id', c.enrollment_id, 'session_date', c.session_date)), '[]'::jsonb)
                   from public.training_checkins c
                   where c.athlete_id = (select auth.uid()) and c.session_date >= (select min(ac.start_date) from active ac)))
  );
$$;

revoke all on function public.my_profile_home(text, text) from public, anon;
grant execute on function public.my_profile_home(text, text) to authenticated;

commit;
