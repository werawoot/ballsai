-- 107-my-profile-home-weight-v1.sql
-- Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only with separate
-- owner approval, in the same session as SQL106 (apply 106 then 107 at once). Read the Project ID
-- in Settings > General before each run. Run as postgres. Needs SQL91 and SQL106 on the project.
-- Precheck: sql/107-my-profile-home-weight-precheck.sql. Postcheck: sql/107-my-profile-home-weight-postcheck.sql.
-- Rollback: sql/107-my-profile-home-weight-down.sql (only together with SQL106's rollback, after it).
--
-- Why (code review of SQL106, 26 Nov 2026; reproduced on Staging): my_profile_home (SQL91) is
-- SECURITY INVOKER and reads athlete_profiles.weight_kg. Once SQL106 took SELECT on that column
-- from authenticated, every call fails with 42501 (permission denied for table athlete_profiles):
-- /profile fails for every signed-in user. Staging had SQL106 alone from 26 Nov 2026 until this file.
-- What: my_profile_home is recreated word for word as SQL91 except one column: the weight comes from
-- athlete_weight_kg(ap.user_id), which answers the caller's own weight. Same name, arguments, return,
-- SECURITY INVOKER and grants. No other function or view reads weight_kg (read on both projects,
-- 26 Nov 2026: only my_profile_home, and athlete_weight_kg itself).

begin;

do $$
begin
  if to_regprocedure('public.my_profile_home(text, text)') is null then raise exception 'SQL107 needs SQL91 (my_profile_home)'; end if;
  if to_regprocedure('public.athlete_weight_kg(uuid)') is null then raise exception 'SQL107 needs SQL106 (athlete_weight_kg)'; end if;
end;
$$;

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
    -- The public columns of lib/athlete-private.ts PUBLIC_PROFILE_COLUMNS, and the caller's own
    -- weight through athlete_weight_kg (sql/106: the caller may no longer read the column).
    'athlete', (select to_jsonb(a) from (
      select ap.user_id, ap.display_name, ap.sport, ap.position, ap.province, ap.height_cm, public.athlete_weight_kg(ap.user_id) as weight_kg,
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

do $$
begin
  if has_function_privilege('anon', 'public.my_profile_home(text, text)', 'execute') then
    raise exception 'SQL107 privileges are wider than intended';
  end if;
end;
$$;

commit;
