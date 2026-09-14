-- 23-venues-and-bookings-v1.sql
-- Closed Beta Venue Owner flow:
-- owner creates venue -> adds playable spaces and time slots ->
-- a signed-in user requests a slot -> owner confirms or declines.
--
-- This deliberately does not include payment, payouts, reviews, or recurring slots.
-- Apply after 22-guardian-consent-trigger-v1.sql to project hivedzrwrrcnjrlirhtv only.

begin;

create table if not exists public.venue_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 2 and 120),
  province text not null check (char_length(btrim(province)) between 2 and 100),
  address text not null check (char_length(btrim(address)) between 5 and 500),
  contact_phone text not null check (char_length(btrim(contact_phone)) between 6 and 30),
  description text not null default '' check (char_length(description) <= 1200),
  amenities text[] not null default '{}',
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists venue_profiles_owner_idx on public.venue_profiles(owner_id, created_at desc);
create index if not exists venue_profiles_published_province_idx on public.venue_profiles(province, created_at desc)
  where is_published;

create table if not exists public.venue_courts (
  id uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venue_profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  sport text not null default 'football' check (sport in ('football', 'futsal')),
  surface text not null default '' check (char_length(surface) <= 80),
  capacity integer check (capacity is null or capacity between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(venue_id, name)
);

create index if not exists venue_courts_venue_idx on public.venue_courts(venue_id, is_active);

create table if not exists public.venue_slots (
  id uuid primary key default gen_random_uuid(),
  court_id uuid not null references public.venue_courts(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  price_baht integer not null check (price_baht >= 0 and price_baht <= 100000),
  status text not null default 'open' check (status in ('open', 'blocked')),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique(court_id, starts_at, ends_at)
);

create index if not exists venue_slots_court_time_idx on public.venue_slots(court_id, starts_at)
  where status = 'open';

create table if not exists public.venue_booking_requests (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.venue_slots(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  purpose text not null check (char_length(btrim(purpose)) between 2 and 160),
  note text not null default '' check (char_length(note) <= 600),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'declined', 'cancelled')),
  requested_at timestamptz not null default now(),
  responded_at timestamptz,
  cancelled_at timestamptz
);

-- Only one live request can reserve a slot. A declined or cancelled request frees it.
create unique index if not exists venue_booking_requests_live_slot_idx
  on public.venue_booking_requests(slot_id)
  where status in ('pending', 'confirmed');
create index if not exists venue_booking_requests_requester_idx
  on public.venue_booking_requests(requester_id, requested_at desc);

alter table public.venue_profiles enable row level security;
alter table public.venue_courts enable row level security;
alter table public.venue_slots enable row level security;
alter table public.venue_booking_requests enable row level security;

drop policy if exists venue_profiles_select_published_or_owner on public.venue_profiles;
create policy venue_profiles_select_published_or_owner on public.venue_profiles
for select to anon, authenticated
using (is_published or owner_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists venue_courts_select_published_or_owner on public.venue_courts;
create policy venue_courts_select_published_or_owner on public.venue_courts
for select to anon, authenticated
using (exists (
  select 1 from public.venue_profiles v
  where v.id = venue_courts.venue_id
    and ((v.is_published and venue_courts.is_active) or v.owner_id = (select auth.uid()) or (select public.is_admin()))
));

drop policy if exists venue_slots_select_published_or_owner on public.venue_slots;
create policy venue_slots_select_published_or_owner on public.venue_slots
for select to anon, authenticated
using (exists (
  select 1
  from public.venue_courts c
  join public.venue_profiles v on v.id = c.venue_id
  where c.id = venue_slots.court_id
    and ((v.is_published and c.is_active and venue_slots.status = 'open') or v.owner_id = (select auth.uid()) or (select public.is_admin()))
));

drop policy if exists venue_bookings_select_participants on public.venue_booking_requests;
create policy venue_bookings_select_participants on public.venue_booking_requests
for select to authenticated
using (
  requester_id = (select auth.uid())
  or (select public.is_admin())
  or exists (
    select 1
    from public.venue_slots s
    join public.venue_courts c on c.id = s.court_id
    join public.venue_profiles v on v.id = c.venue_id
    where s.id = venue_booking_requests.slot_id and v.owner_id = (select auth.uid())
  )
);

create or replace function public.create_venue_profile_safely(
  p_name text,
  p_province text,
  p_address text,
  p_contact_phone text,
  p_description text default '',
  p_amenities text[] default '{}'
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  insert into public.venue_profiles (owner_id, name, province, address, contact_phone, description, amenities)
  values (auth.uid(), btrim(p_name), btrim(p_province), btrim(p_address), btrim(p_contact_phone), left(coalesce(p_description, ''), 1200), coalesce(p_amenities, '{}'))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_venue_court_safely(
  p_venue_id uuid,
  p_name text,
  p_sport text default 'football',
  p_surface text default '',
  p_capacity integer default null
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (select 1 from public.venue_profiles where id = p_venue_id and (owner_id = auth.uid() or public.is_admin())) then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  insert into public.venue_courts (venue_id, name, sport, surface, capacity)
  values (p_venue_id, btrim(p_name), p_sport, left(coalesce(p_surface, ''), 80), p_capacity)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.create_venue_slot_safely(
  p_court_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_price_baht integer
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not exists (
    select 1 from public.venue_courts c join public.venue_profiles v on v.id = c.venue_id
    where c.id = p_court_id and c.is_active and (v.owner_id = auth.uid() or public.is_admin())
  ) then raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501'; end if;
  if p_starts_at < now() or p_ends_at <= p_starts_at or p_ends_at > p_starts_at + interval '12 hours' then
    raise exception 'INVALID_SLOT_TIME' using errcode = '22023';
  end if;
  insert into public.venue_slots (court_id, starts_at, ends_at, price_baht)
  values (p_court_id, p_starts_at, p_ends_at, p_price_baht)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.request_venue_booking_safely(
  p_slot_id uuid,
  p_purpose text,
  p_note text default ''
)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_start timestamptz;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED' using errcode = '42501'; end if;
  select s.starts_at into v_start
  from public.venue_slots s
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where s.id = p_slot_id and s.status = 'open' and c.is_active and v.is_published
  for update of s;
  if v_start is null or v_start <= now() then raise exception 'SLOT_UNAVAILABLE' using errcode = '22023'; end if;
  if exists (select 1 from public.venue_booking_requests where slot_id = p_slot_id and status in ('pending', 'confirmed')) then
    raise exception 'SLOT_ALREADY_REQUESTED' using errcode = '23505';
  end if;
  insert into public.venue_booking_requests (slot_id, requester_id, purpose, note)
  values (p_slot_id, auth.uid(), btrim(p_purpose), left(coalesce(p_note, ''), 600))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.respond_venue_booking_safely(p_booking_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v_owner uuid;
begin
  if p_status not in ('confirmed', 'declined') then raise exception 'INVALID_BOOKING_STATUS' using errcode = '22023'; end if;
  select v.owner_id into v_owner
  from public.venue_booking_requests b
  join public.venue_slots s on s.id = b.slot_id
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where b.id = p_booking_id and b.status = 'pending'
  for update of b;
  if v_owner is null then raise exception 'BOOKING_NOT_PENDING' using errcode = '22023'; end if;
  if v_owner <> auth.uid() and not public.is_admin() then raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501'; end if;
  update public.venue_booking_requests set status = p_status, responded_at = now() where id = p_booking_id;
end;
$$;

create or replace function public.cancel_venue_booking_safely(p_booking_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.venue_booking_requests
  set status = 'cancelled', cancelled_at = now()
  where id = p_booking_id and requester_id = auth.uid() and status = 'pending';
  if not found then raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = '22023'; end if;
end;
$$;

revoke all on function public.create_venue_profile_safely(text, text, text, text, text, text[]) from public;
revoke all on function public.create_venue_court_safely(uuid, text, text, text, integer) from public;
revoke all on function public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer) from public;
revoke all on function public.request_venue_booking_safely(uuid, text, text) from public;
revoke all on function public.respond_venue_booking_safely(uuid, text) from public;
revoke all on function public.cancel_venue_booking_safely(uuid) from public;
grant execute on function public.create_venue_profile_safely(text, text, text, text, text, text[]) to authenticated;
grant execute on function public.create_venue_court_safely(uuid, text, text, text, integer) to authenticated;
grant execute on function public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.request_venue_booking_safely(uuid, text, text) to authenticated;
grant execute on function public.respond_venue_booking_safely(uuid, text) to authenticated;
grant execute on function public.cancel_venue_booking_safely(uuid) to authenticated;

commit;
