-- 91-my-profile-home-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first, Production (hivedzrwrrcnjrlirhtv) only
-- with separate owner approval. Read the Project ID in Settings > General before each run.
-- Run as postgres. Depends on sql/58 (my_athlete_private), sql/63 (training tables) and
-- sql/82 (my_team_memberships), all applied on both projects. Precheck:
-- sql/91-my-profile-home-precheck.sql. Postcheck: sql/91-my-profile-home-postcheck.sql.
-- Rollback: sql/91-my-profile-home-down.sql.
--
-- Why (T59, structural review 23 Oct 2026): /profile, the page every signed-in athlete opens,
-- sent ten separate reads in three waves (profile row, then seven in parallel, then the
-- private fields and training). At nationwide scale that is ten PostgREST requests and ten
-- pooled connections per page view.
-- What: one function that returns the same data in one call, as JSON. It is SECURITY
-- INVOKER: every read runs under the caller's own RLS, exactly as the ten reads did, and
-- every row is the caller's own (auth.uid()). The birth date and consent time still come
-- only through my_athlete_private() (sql/58), and team names through my_team_memberships()
-- (sql/82); this function widens nothing. The app falls back to the old reads while this
-- file is not applied.
-- Scale: every read is by primary key or an index that leads with the caller's id:
-- profiles, athlete_profiles and athlete_progress by primary key;
-- player_ranks_player_sport_season_idx; athlete_highlights_athlete_created_idx,
-- athlete_videos_athlete_id_idx and guardian_links_athlete_status_idx for the counts;
-- training_enrollments_athlete_idx and training_checkins_athlete_date_idx (sql/63).
-- Memberships stay capped at 5, as the page showed.

begin;

do $$
begin
  if to_regprocedure('public.my_athlete_private()') is null then raise exception 'SQL91 needs SQL58 (my_athlete_private)'; end if;
  if to_regprocedure('public.my_team_memberships(integer)') is null then raise exception 'SQL91 needs SQL82 (my_team_memberships)'; end if;
  if to_regclass('public.training_enrollments') is null or to_regclass('public.training_checkins') is null then raise exception 'SQL91 needs SQL63 (training)'; end if;
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

do $$
begin
  if has_function_privilege('anon', 'public.my_profile_home(text, text)', 'execute') then
    raise exception 'SQL91 privileges are wider than intended';
  end if;
end;
$$;

commit;
