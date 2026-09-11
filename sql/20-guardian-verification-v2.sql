-- BallDoenSai.com Guardian Verification V2
-- Apply after 19-athlete-sport-profiles-v1.sql. Additive migration that replaces
-- self-attested guardian_consent_at with an auditable email-verification flow.
-- The shared backend generates raw tokens and sends email; this database stores hashes.

begin;

create table if not exists public.guardian_verification_requests (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  guardian_name text not null check (char_length(trim(guardian_name)) between 2 and 160),
  relationship text not null check (char_length(trim(relationship)) between 2 and 80),
  guardian_email text not null check (guardian_email = lower(trim(guardian_email))),
  verification_token_hash text not null check (verification_token_hash ~ '^[a-f0-9]{64}$'),
  revocation_token_hash text not null check (revocation_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'verified', 'expired', 'cancelled')),
  requested_at timestamptz not null default now(),
  expires_at timestamptz not null,
  verified_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  check (expires_at > requested_at),
  check ((status = 'verified') = (verified_at is not null))
);

create unique index if not exists guardian_verification_one_pending_idx
  on public.guardian_verification_requests (athlete_id)
  where status = 'pending';
create index if not exists guardian_verification_athlete_status_idx
  on public.guardian_verification_requests (athlete_id, status, requested_at desc);
create index if not exists guardian_verification_token_idx
  on public.guardian_verification_requests (verification_token_hash)
  where status = 'pending';

create table if not exists public.guardian_consents (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  request_id uuid not null unique references public.guardian_verification_requests(id) on delete restrict,
  guardian_email text not null,
  revocation_token_hash text not null check (revocation_token_hash ~ '^[a-f0-9]{64}$'),
  verified_at timestamptz not null,
  revoked_at timestamptz,
  revocation_reason text check (revocation_reason is null or char_length(revocation_reason) <= 500),
  check (revoked_at is null or revoked_at >= verified_at)
);

create unique index if not exists guardian_consents_one_active_idx
  on public.guardian_consents (athlete_id)
  where revoked_at is null;
create index if not exists guardian_consents_revocation_token_idx
  on public.guardian_consents (revocation_token_hash)
  where revoked_at is null;

create table if not exists public.guardian_consent_events (
  id bigint generated always as identity primary key,
  athlete_id uuid not null references public.athlete_profiles(user_id) on delete cascade,
  request_id uuid references public.guardian_verification_requests(id) on delete set null,
  consent_id uuid references public.guardian_consents(id) on delete set null,
  event_type text not null check (event_type in ('requested', 'verified', 'revoked', 'expired', 'cancelled')),
  actor_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists guardian_consent_events_athlete_created_idx
  on public.guardian_consent_events (athlete_id, created_at desc);
create index if not exists guardian_consent_events_request_created_idx
  on public.guardian_consent_events (request_id, created_at desc);

alter table public.guardian_verification_requests enable row level security;
alter table public.guardian_consents enable row level security;
alter table public.guardian_consent_events enable row level security;

drop policy if exists "guardian_requests_owner_or_admin_select" on public.guardian_verification_requests;
create policy "guardian_requests_owner_or_admin_select"
on public.guardian_verification_requests for select to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "guardian_consents_owner_or_admin_select" on public.guardian_consents;
create policy "guardian_consents_owner_or_admin_select"
on public.guardian_consents for select to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "guardian_events_owner_or_admin_select" on public.guardian_consent_events;
create policy "guardian_events_owner_or_admin_select"
on public.guardian_consent_events for select to authenticated
using (athlete_id = (select auth.uid()) or (select public.is_admin()));

revoke all on table public.guardian_verification_requests from anon, authenticated;
revoke all on table public.guardian_consents from anon, authenticated;
revoke all on table public.guardian_consent_events from anon, authenticated;
grant select on table public.guardian_verification_requests, public.guardian_consents, public.guardian_consent_events to authenticated;

create or replace function public.has_active_guardian_consent(p_athlete_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.guardian_consents consent
    where consent.athlete_id = p_athlete_id
      and consent.revoked_at is null
  );
$$;

revoke all on function public.has_active_guardian_consent(uuid) from public;

create or replace function public.enforce_guardian_consent_for_public_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE'
     and new.guardian_consent_at is distinct from old.guardian_consent_at
     and auth.uid() is not null then
    raise exception 'GUARDIAN_CONSENT_BACKEND_ONLY' using errcode = '42501';
  end if;

  if new.is_public then
    if new.birth_date is null then
      raise exception 'PUBLIC_REQUIRES_BIRTH_DATE' using errcode = '22023';
    end if;
    if date_part('year', age(current_date, new.birth_date)) < 20
       and not public.has_active_guardian_consent(new.user_id) then
      raise exception 'PUBLIC_REQUIRES_GUARDIAN_CONSENT' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_guardian_consent_for_public_sport_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_birth_date date;
begin
  if not new.is_public then return new; end if;

  select birth_date into v_birth_date
  from public.athlete_profiles
  where user_id = new.athlete_id;

  if v_birth_date is null then
    raise exception 'PUBLIC_REQUIRES_BIRTH_DATE' using errcode = '22023';
  end if;
  if date_part('year', age(current_date, v_birth_date)) < 20
     and not public.has_active_guardian_consent(new.athlete_id) then
    raise exception 'PUBLIC_REQUIRES_GUARDIAN_CONSENT' using errcode = '22023';
  end if;
  return new;
end;
$$;

drop trigger if exists athlete_sport_profiles_publication_guard on public.athlete_sport_profiles;
create trigger athlete_sport_profiles_publication_guard
before insert or update of is_public on public.athlete_sport_profiles
for each row execute function public.enforce_guardian_consent_for_public_sport_profile();

-- Existing guardian_consent_at values have no auditable request or revocation path.
-- Err on the side of privacy: under-20 athletes are unpublished until re-verified.
update public.athlete_sport_profiles sport_profile
set is_public = false
from public.athlete_profiles profile
where profile.user_id = sport_profile.athlete_id
  and sport_profile.is_public
  and (profile.birth_date is null or date_part('year', age(current_date, profile.birth_date)) < 20);

update public.athlete_profiles
set is_public = false,
    guardian_consent_at = null,
    updated_at = now()
where is_public
  and (birth_date is null or date_part('year', age(current_date, birth_date)) < 20);

create or replace function public.request_guardian_verification(
  p_guardian_name text,
  p_relationship text,
  p_guardian_email text,
  p_verification_token_hash text,
  p_revocation_token_hash text
)
returns table (request_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_athlete_id uuid := auth.uid();
  v_birth_date date;
  v_request_id uuid;
  v_expires_at timestamptz := now() + interval '24 hours';
  v_email text := lower(trim(p_guardian_email));
begin
  if v_athlete_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  if p_guardian_name is null or char_length(trim(p_guardian_name)) not between 2 and 160 then
    raise exception 'INVALID_GUARDIAN_NAME' using errcode = '22023';
  end if;
  if p_relationship is null or char_length(trim(p_relationship)) not between 2 and 80 then
    raise exception 'INVALID_GUARDIAN_RELATIONSHIP' using errcode = '22023';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' then
    raise exception 'INVALID_GUARDIAN_EMAIL' using errcode = '22023';
  end if;
  if p_verification_token_hash !~ '^[a-f0-9]{64}$'
     or p_revocation_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_TOKEN_HASH' using errcode = '22023';
  end if;

  select birth_date into v_birth_date from public.athlete_profiles where user_id = v_athlete_id;
  if not found then raise exception 'ATHLETE_PROFILE_REQUIRED' using errcode = '22023'; end if;
  if v_birth_date is null or date_part('year', age(current_date, v_birth_date)) >= 20 then
    raise exception 'GUARDIAN_VERIFICATION_NOT_REQUIRED' using errcode = '22023';
  end if;
  if public.has_active_guardian_consent(v_athlete_id) then
    raise exception 'GUARDIAN_CONSENT_ALREADY_ACTIVE' using errcode = '22023';
  end if;

  with expired as (
    update public.guardian_verification_requests
    set status = 'expired'
    where athlete_id = v_athlete_id
      and status = 'pending'
      and expires_at <= now()
    returning id, athlete_id
  )
  insert into public.guardian_consent_events (athlete_id, request_id, event_type, actor_user_id)
  select athlete_id, id, 'expired', v_athlete_id from expired;

  if exists (
    select 1
    from public.guardian_verification_requests
    where athlete_id = v_athlete_id
      and requested_at > now() - interval '10 minutes'
  ) then
    raise exception 'GUARDIAN_REQUEST_RATE_LIMITED' using errcode = '22023';
  end if;

  with cancelled as (
    update public.guardian_verification_requests
    set status = 'cancelled'
    where athlete_id = v_athlete_id and status = 'pending'
    returning id, athlete_id
  )
  insert into public.guardian_consent_events (athlete_id, request_id, event_type, actor_user_id)
  select athlete_id, id, 'cancelled', v_athlete_id from cancelled;

  insert into public.guardian_verification_requests (
    athlete_id, guardian_name, relationship, guardian_email,
    verification_token_hash, revocation_token_hash, expires_at, created_by
  ) values (
    v_athlete_id, trim(p_guardian_name), trim(p_relationship), v_email,
    p_verification_token_hash, p_revocation_token_hash, v_expires_at, v_athlete_id
  ) returning id into v_request_id;

  insert into public.guardian_consent_events (athlete_id, request_id, event_type, actor_user_id)
  values (v_athlete_id, v_request_id, 'requested', v_athlete_id);

  return query select v_request_id, v_expires_at;
end;
$$;

create or replace function public.confirm_guardian_verification(p_verification_token text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_request public.guardian_verification_requests%rowtype;
  v_consent_id uuid;
  v_token_hash text := encode(digest(p_verification_token, 'sha256'), 'hex');
begin
  select * into v_request
  from public.guardian_verification_requests
  where verification_token_hash = v_token_hash
    and status = 'pending'
    and expires_at > now()
  for update;
  if not found then raise exception 'VERIFICATION_LINK_INVALID_OR_EXPIRED' using errcode = '22023'; end if;

  update public.guardian_verification_requests
  set status = 'verified', verified_at = now()
  where id = v_request.id;

  insert into public.guardian_consents (
    athlete_id, request_id, guardian_email, revocation_token_hash, verified_at
  ) values (
    v_request.athlete_id, v_request.id, v_request.guardian_email,
    v_request.revocation_token_hash, now()
  ) returning id into v_consent_id;

  update public.athlete_profiles
  set guardian_consent_at = now(), updated_at = now()
  where user_id = v_request.athlete_id;

  insert into public.guardian_consent_events (athlete_id, request_id, consent_id, event_type)
  values (v_request.athlete_id, v_request.id, v_consent_id, 'verified');

  return v_consent_id;
end;
$$;

create or replace function public.cancel_guardian_verification(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_athlete_id uuid := auth.uid();
begin
  if v_athlete_id is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;

  update public.guardian_verification_requests
  set status = 'cancelled'
  where id = p_request_id
    and athlete_id = v_athlete_id
    and status = 'pending';

  if not found then raise exception 'PENDING_GUARDIAN_REQUEST_NOT_FOUND' using errcode = '22023'; end if;

  insert into public.guardian_consent_events (athlete_id, request_id, event_type, actor_user_id)
  values (v_athlete_id, p_request_id, 'cancelled', v_athlete_id);
end;
$$;

create or replace function public.revoke_guardian_consent(
  p_revocation_token text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, pg_catalog
as $$
declare
  v_consent public.guardian_consents%rowtype;
  v_token_hash text := encode(digest(p_revocation_token, 'sha256'), 'hex');
begin
  if p_reason is not null and char_length(p_reason) > 500 then
    raise exception 'INVALID_REVOCATION_REASON' using errcode = '22023';
  end if;

  select * into v_consent
  from public.guardian_consents
  where revocation_token_hash = v_token_hash and revoked_at is null
  for update;
  if not found then raise exception 'REVOCATION_LINK_INVALID' using errcode = '22023'; end if;

  update public.guardian_consents
  set revoked_at = now(), revocation_reason = nullif(trim(p_reason), '')
  where id = v_consent.id;
  update public.athlete_sport_profiles
  set is_public = false, updated_at = now()
  where athlete_id = v_consent.athlete_id and is_public;
  update public.athlete_profiles
  set is_public = false, guardian_consent_at = null, updated_at = now()
  where user_id = v_consent.athlete_id;

  insert into public.guardian_consent_events (athlete_id, request_id, consent_id, event_type)
  values (v_consent.athlete_id, v_consent.request_id, v_consent.id, 'revoked');

  return v_consent.id;
end;
$$;

revoke all on function public.request_guardian_verification(text, text, text, text, text) from public;
revoke all on function public.confirm_guardian_verification(text) from public;
revoke all on function public.cancel_guardian_verification(uuid) from public;
revoke all on function public.revoke_guardian_consent(text, text) from public;
grant execute on function public.request_guardian_verification(text, text, text, text, text) to authenticated;
grant execute on function public.confirm_guardian_verification(text) to anon, authenticated;
grant execute on function public.cancel_guardian_verification(uuid) to authenticated;
grant execute on function public.revoke_guardian_consent(text, text) to anon, authenticated;

commit;
