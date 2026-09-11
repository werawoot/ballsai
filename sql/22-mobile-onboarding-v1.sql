-- BallDoenSai.com atomic mobile onboarding V1.
-- Apply after 19-athlete-sport-profiles-v1.sql and 20-guardian-verification-v2.sql.
-- The caller may create only its own self-verified identity. Rating, XP, badges and
-- guardian consent remain owned by their existing verified backend flows.

begin;

create or replace function public.complete_mobile_onboarding(
  p_persona text,
  p_sport text,
  p_display_name text default null,
  p_position text default null,
  p_current_team text default null,
  p_province text default null,
  p_birth_date date default null,
  p_is_public boolean default false
)
returns table (
  onboarding_completed_at timestamptz,
  requires_guardian_verification boolean,
  is_public boolean
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_user_id uuid := auth.uid();
  v_completed_at timestamptz := now();
  v_is_athlete boolean := p_persona = 'athlete';
  v_is_minor boolean := false;
  v_is_public boolean := coalesce(p_is_public, false);
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_persona not in ('athlete', 'guardian', 'coach_organizer') then
    raise exception 'INVALID_PERSONA' using errcode = '22023';
  end if;
  if p_sport not in ('football', 'futsal', 'basketball') then
    raise exception 'INVALID_SPORT' using errcode = '22023';
  end if;

  if v_is_athlete then
    if p_display_name is null or char_length(trim(p_display_name)) not between 2 and 60 then
      raise exception 'INVALID_DISPLAY_NAME' using errcode = '22023';
    end if;
    if p_birth_date is null
       or p_birth_date > current_date
       or date_part('year', age(current_date, p_birth_date)) not between 5 and 100 then
      raise exception 'INVALID_BIRTH_DATE' using errcode = '22023';
    end if;
    if nullif(trim(p_position), '') is null then
      raise exception 'POSITION_REQUIRED' using errcode = '22023';
    end if;
    if nullif(trim(p_province), '') is null then
      raise exception 'PROVINCE_REQUIRED' using errcode = '22023';
    end if;

    v_is_minor := date_part('year', age(current_date, p_birth_date)) < 20;
    if v_is_minor then v_is_public := false; end if;

    insert into public.athlete_profiles (
      user_id, display_name, birth_date, sport, position, province, current_team,
      is_public, verification_level, verified_at
    ) values (
      v_user_id, trim(p_display_name), p_birth_date, p_sport,
      nullif(trim(p_position), ''), nullif(trim(p_province), ''),
      nullif(trim(p_current_team), ''), v_is_public, 'self', null
    )
    on conflict (user_id) do update set
      display_name = excluded.display_name,
      birth_date = excluded.birth_date,
      sport = excluded.sport,
      position = excluded.position,
      province = excluded.province,
      current_team = excluded.current_team,
      is_public = excluded.is_public;

    insert into public.athlete_sport_profiles (
      athlete_id, sport, position, current_team, province, is_public, status
    ) values (
      v_user_id, p_sport, nullif(trim(p_position), ''),
      nullif(trim(p_current_team), ''), nullif(trim(p_province), ''),
      v_is_public, 'active'
    )
    on conflict (athlete_id, sport) do update set
      position = excluded.position,
      current_team = excluded.current_team,
      province = excluded.province,
      is_public = excluded.is_public,
      status = 'active';
  else
    v_is_public := false;
  end if;

  update public.profiles
  set onboarding_persona = p_persona,
      onboarding_sport = p_sport,
      onboarding_completed_at = v_completed_at
  where id = v_user_id;

  if not found then
    raise exception 'PROFILE_REQUIRED' using errcode = '22023';
  end if;

  return query select v_completed_at, (v_is_athlete and v_is_minor), v_is_public;
end;
$$;

revoke all on function public.complete_mobile_onboarding(text, text, text, text, text, text, date, boolean) from public;
grant execute on function public.complete_mobile_onboarding(text, text, text, text, text, text, date, boolean) to authenticated;

commit;
