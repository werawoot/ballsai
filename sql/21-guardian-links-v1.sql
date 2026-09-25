-- BallDoenSai.com guardian links V1
-- Apply after 14-guardian-consent-enforcement-v1.sql and 17-notifications-v1.sql.
-- A guardian requests a link, the athlete accepts it, and the guardian's consent is
-- then recorded. This replaces a minor self-attesting guardian consent in the browser.

begin;

alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in ('match_result', 'badge_earned', 'team_status', 'team_invite', 'guardian_link'));

create table if not exists public.guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_id uuid not null references auth.users(id) on delete cascade,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'revoked')),
  consent_at timestamptz not null,
  consent_version text not null default 'guardian-link-v1',
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  revoked_at timestamptz,
  unique (guardian_id, athlete_id)
);

create index if not exists guardian_links_guardian_status_idx
  on public.guardian_links (guardian_id, status, requested_at desc);
create index if not exists guardian_links_athlete_status_idx
  on public.guardian_links (athlete_id, status, requested_at desc);

alter table public.guardian_links enable row level security;

drop policy if exists guardian_links_participants_select on public.guardian_links;
create policy guardian_links_participants_select on public.guardian_links for select to authenticated
using (guardian_id = (select auth.uid()) or athlete_id = (select auth.uid()) or (select public.is_admin()));

revoke all on table public.guardian_links from anon;
revoke all on table public.guardian_links from authenticated;
grant select on table public.guardian_links to authenticated;

create or replace function public.is_accepted_guardian_for(p_athlete_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.guardian_links
    where athlete_id = p_athlete_id
      and guardian_id = (select auth.uid())
      and status = 'accepted'
      and consent_at is not null
  );
$$;

revoke all on function public.is_accepted_guardian_for(uuid) from public;
grant execute on function public.is_accepted_guardian_for(uuid) to anon, authenticated;

-- Guardians can read only the linked athlete's private profile/progress/badges.
drop policy if exists athlete_profiles_public_or_owner_select on public.athlete_profiles;
create policy athlete_profiles_public_owner_guardian_select
on public.athlete_profiles for select to anon, authenticated
using (
  is_public = true
  or user_id = (select auth.uid())
  or (select public.is_admin())
  or (select public.is_accepted_guardian_for(user_id))
);

drop policy if exists identity_progress_public_or_owner_select on public.athlete_progress;
create policy identity_progress_public_owner_guardian_select
on public.athlete_progress for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or (select public.is_accepted_guardian_for(athlete_id))
  or exists (select 1 from public.athlete_profiles p where p.user_id = athlete_progress.athlete_id and p.is_public)
);

drop policy if exists identity_badges_public_or_owner_select on public.athlete_badges;
create policy identity_badges_public_owner_guardian_select
on public.athlete_badges for select to anon, authenticated
using (
  athlete_id = (select auth.uid())
  or (select public.is_admin())
  or (select public.is_accepted_guardian_for(athlete_id))
  or exists (select 1 from public.athlete_profiles p where p.user_id = athlete_badges.athlete_id and p.is_public)
);

create or replace function public.request_guardian_link(p_athlete_email text, p_confirm_consent boolean)
returns uuid
language plpgsql
security definer
set search_path = public, auth, pg_catalog
as $$
declare
  v_guardian_id uuid := auth.uid();
  v_athlete_id uuid;
  v_link_id uuid;
  v_persona text;
begin
  if v_guardian_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_confirm_consent is not true then raise exception 'CONSENT_REQUIRED' using errcode = '22023'; end if;
  select onboarding_persona into v_persona from public.profiles where id = v_guardian_id;
  if coalesce(v_persona, '') <> 'guardian' then raise exception 'GUARDIAN_ROLE_REQUIRED' using errcode = '42501'; end if;
  select id into v_athlete_id from auth.users where lower(email) = lower(trim(p_athlete_email)) limit 1;
  if v_athlete_id is null then raise exception 'ATHLETE_NOT_FOUND'; end if;
  if v_athlete_id = v_guardian_id then raise exception 'CANNOT_LINK_SELF'; end if;
  if not exists (select 1 from public.athlete_profiles where user_id = v_athlete_id) then raise exception 'ATHLETE_PROFILE_REQUIRED'; end if;

  insert into public.guardian_links (guardian_id, athlete_id, status, consent_at, consent_version, requested_at, responded_at, revoked_at)
  values (v_guardian_id, v_athlete_id, 'pending', now(), 'guardian-link-v1', now(), null, null)
  on conflict (guardian_id, athlete_id) do update set
    status = 'pending', consent_at = now(), consent_version = 'guardian-link-v1',
    requested_at = now(), responded_at = null, revoked_at = null
  returning id into v_link_id;

  perform public.create_notification(v_athlete_id, 'guardian_link', 'มีคำขอเชื่อมบัญชีผู้ปกครอง',
    'โปรดตรวจสอบและตอบรับคำขอในหน้าผู้ปกครอง', '/guardian',
    'guardian_link_request:' || v_link_id::text || ':' || v_athlete_id::text);
  return v_link_id;
end;
$$;

create or replace function public.respond_guardian_link(p_link_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_link public.guardian_links%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_status not in ('accepted', 'declined') then raise exception 'INVALID_STATUS' using errcode = '22023'; end if;
  select * into v_link from public.guardian_links where id = p_link_id and athlete_id = auth.uid() for update;
  if not found or v_link.status <> 'pending' then raise exception 'GUARDIAN_LINK_NOT_FOUND' using errcode = '42501'; end if;
  update public.guardian_links set status = p_status, responded_at = now() where id = p_link_id;
  if p_status = 'accepted' then
    update public.athlete_profiles set guardian_consent_at = v_link.consent_at where user_id = v_link.athlete_id;
    perform public.create_notification(v_link.guardian_id, 'guardian_link', 'เชื่อมบัญชีนักกีฬาแล้ว',
      'นักกีฬาได้ตอบรับการเชื่อมบัญชี คุณสามารถติดตามความก้าวหน้าได้', '/guardian',
      'guardian_link_accepted:' || v_link.id::text);
  end if;
end;
$$;

create or replace function public.revoke_guardian_link(p_link_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_link public.guardian_links%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select * into v_link from public.guardian_links where id = p_link_id and guardian_id = auth.uid() for update;
  if not found then raise exception 'GUARDIAN_LINK_NOT_FOUND' using errcode = '42501'; end if;
  update public.guardian_links set status = 'revoked', revoked_at = now() where id = p_link_id;
  if not exists (select 1 from public.guardian_links where athlete_id = v_link.athlete_id and status = 'accepted' and consent_at is not null) then
    update public.athlete_profiles set guardian_consent_at = null, is_public = false
    where user_id = v_link.athlete_id;
  end if;
end;
$$;

revoke all on function public.request_guardian_link(text, boolean) from public;
revoke all on function public.respond_guardian_link(uuid, text) from public;
revoke all on function public.revoke_guardian_link(uuid) from public;
grant execute on function public.request_guardian_link(text, boolean) to authenticated;
grant execute on function public.respond_guardian_link(uuid, text) to authenticated;
grant execute on function public.revoke_guardian_link(uuid) to authenticated;

-- Publishing a minor profile now requires an accepted, consented guardian link.
create or replace function public.enforce_guardian_consent_for_public_profile()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.is_public then
    if new.birth_date is null then raise exception 'PUBLIC_REQUIRES_BIRTH_DATE' using errcode = '22023'; end if;
    if date_part('year', age(current_date, new.birth_date)) < 20
       and not exists (select 1 from public.guardian_links where athlete_id = new.user_id and status = 'accepted' and consent_at is not null) then
      raise exception 'PUBLIC_REQUIRES_GUARDIAN_LINK' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

update public.athlete_profiles p
set is_public = false
where p.is_public
  and p.birth_date is not null
  and date_part('year', age(current_date, p.birth_date)) < 20
  and not exists (select 1 from public.guardian_links gl where gl.athlete_id = p.user_id and gl.status = 'accepted' and gl.consent_at is not null);

commit;
