-- BallDoenSai.com guardian consent enforcement V1
-- Apply after sql/athlete-profile-v2.sql. Safe to re-run in the Supabase SQL editor.
--
-- Why this exists: app/profile/EditProfileForm.tsx already refuses to publish a minor's
-- profile without guardian consent, but that check lives in the browser. A direct API
-- call with a valid session could still set is_public = true, and the RLS policy only
-- asks who owns the row, not whether publishing is allowed. The users of this platform
-- are children, so the rule belongs in the database too.
--
-- The rule mirrors the form exactly:
--   * a public athlete profile must have a birth date
--   * anyone under 20 must also have guardian_consent_at recorded

begin;

create or replace function public.enforce_guardian_consent_for_public_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_public then
    if new.birth_date is null then
      raise exception 'PUBLIC_REQUIRES_BIRTH_DATE' using errcode = '22023';
    end if;
    if date_part('year', age(current_date, new.birth_date)) < 20
       and new.guardian_consent_at is null then
      raise exception 'PUBLIC_REQUIRES_GUARDIAN_CONSENT' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_profiles_guardian_consent_guard on public.athlete_profiles;
create trigger athlete_profiles_guardian_consent_guard
before insert or update on public.athlete_profiles
for each row execute function public.enforce_guardian_consent_for_public_profile();

-- Any row already published under the old client-only rule is unpublished rather than
-- left visible. Nothing is deleted: the athlete can publish again once the guardian
-- consent is recorded, which is the same path a new profile takes.
update public.athlete_profiles
set is_public = false, updated_at = now()
where is_public
  and (
    birth_date is null
    or (date_part('year', age(current_date, birth_date)) < 20 and guardian_consent_at is null)
  );

commit;
