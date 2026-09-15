-- 40-venue-slot-booking-state-v1.sql
-- Separates owner-blocked slots from booking-reserved slots and snapshots the
-- booking display fields so private history never needs broad venue-slot access.
-- Apply to Supabase project hivedzrwrrcnjrlirhtv only, after SQL23, SQL38 and SQL39.

begin;

do $$
begin
  if to_regclass('public.venue_slots') is null
     or to_regclass('public.venue_courts') is null
     or to_regclass('public.venue_profiles') is null
     or to_regclass('public.venue_booking_requests') is null then
    raise exception 'SQL40 requires the venue tables from SQL23';
  end if;

  if to_regprocedure('public.request_venue_booking_safely(uuid,text,text)') is null
     or to_regprocedure('public.respond_venue_booking_safely(uuid,text)') is null
     or to_regprocedure('public.cancel_venue_booking_safely(uuid)') is null
     or to_regprocedure('public.close_venue_slot_safely(uuid)') is null then
    raise exception 'SQL40 requires the venue RPCs from SQL23 and SQL38';
  end if;

  if exists (
    select 1
    from public.venue_slots s
    join public.venue_booking_requests b on b.slot_id = s.id
    where s.status = 'blocked'
      and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'SQL40 found an active booking on a blocked slot; reconcile it before applying';
  end if;
end;
$$;

alter table public.venue_slots
  drop constraint venue_slots_status_check;
alter table public.venue_slots
  add constraint venue_slots_status_check
  check (status in ('open', 'blocked', 'reserved'));

alter table public.venue_booking_requests
  add column if not exists venue_name_snapshot text,
  add column if not exists court_name_snapshot text,
  add column if not exists slot_starts_at_snapshot timestamptz,
  add column if not exists slot_ends_at_snapshot timestamptz,
  add column if not exists price_baht_snapshot integer;

update public.venue_booking_requests b
set venue_name_snapshot = v.name,
    court_name_snapshot = c.name,
    slot_starts_at_snapshot = s.starts_at,
    slot_ends_at_snapshot = s.ends_at,
    price_baht_snapshot = s.price_baht
from public.venue_slots s
join public.venue_courts c on c.id = s.court_id
join public.venue_profiles v on v.id = c.venue_id
where b.slot_id = s.id
  and (
    b.venue_name_snapshot is null
    or b.court_name_snapshot is null
    or b.slot_starts_at_snapshot is null
    or b.slot_ends_at_snapshot is null
    or b.price_baht_snapshot is null
  );

alter table public.venue_booking_requests
  alter column venue_name_snapshot set not null,
  alter column court_name_snapshot set not null,
  alter column slot_starts_at_snapshot set not null,
  alter column slot_ends_at_snapshot set not null,
  alter column price_baht_snapshot set not null;

-- Repair live bookings created before SQL40 without changing booking rows.
update public.venue_slots s
set status = 'reserved'
where s.status = 'open'
  and exists (
    select 1
    from public.venue_booking_requests b
    where b.slot_id = s.id
      and b.status in ('pending', 'confirmed')
  );

create or replace function public.request_venue_booking_safely(
  p_slot_id uuid,
  p_purpose text,
  p_note text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_price_baht integer;
  v_court_name text;
  v_venue_name text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select s.starts_at, s.ends_at, s.price_baht, c.name, v.name
    into v_starts_at, v_ends_at, v_price_baht, v_court_name, v_venue_name
  from public.venue_slots s
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where s.id = p_slot_id
    and s.status = 'open'
    and c.is_active
    and v.is_published
  for update of s;

  if v_starts_at is null or v_starts_at <= now() then
    raise exception 'SLOT_UNAVAILABLE' using errcode = '22023';
  end if;

  insert into public.venue_booking_requests (
    slot_id,
    requester_id,
    purpose,
    note,
    venue_name_snapshot,
    court_name_snapshot,
    slot_starts_at_snapshot,
    slot_ends_at_snapshot,
    price_baht_snapshot
  ) values (
    p_slot_id,
    auth.uid(),
    btrim(p_purpose),
    left(coalesce(p_note, ''), 600),
    v_venue_name,
    v_court_name,
    v_starts_at,
    v_ends_at,
    v_price_baht
  )
  returning id into v_id;

  update public.venue_slots
  set status = 'reserved'
  where id = p_slot_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'SLOT_ALREADY_REQUESTED' using errcode = '23505';
end;
$$;

create or replace function public.respond_venue_booking_safely(
  p_booking_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_slot_id uuid;
  v_slot_status text;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_status not in ('confirmed', 'declined') then
    raise exception 'INVALID_BOOKING_STATUS' using errcode = '22023';
  end if;

  select b.slot_id into v_slot_id
  from public.venue_booking_requests b
  where b.id = p_booking_id;

  if v_slot_id is null then
    raise exception 'BOOKING_NOT_PENDING' using errcode = '22023';
  end if;

  select s.status into v_slot_status
  from public.venue_slots s
  where s.id = v_slot_id
  for update;

  select v.owner_id into v_owner_id
  from public.venue_booking_requests b
  join public.venue_slots s on s.id = b.slot_id
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where b.id = p_booking_id
    and b.status = 'pending'
  for update of b;

  if v_owner_id is null then
    raise exception 'BOOKING_NOT_PENDING' using errcode = '22023';
  end if;
  if v_owner_id <> auth.uid() and not public.is_admin() then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if v_slot_status not in ('open', 'reserved') then
    raise exception 'SLOT_NOT_RESERVABLE' using errcode = '55000';
  end if;

  update public.venue_booking_requests
  set status = p_status,
      responded_at = now()
  where id = p_booking_id;

  if p_status = 'confirmed' then
    update public.venue_slots
    set status = 'reserved'
    where id = v_slot_id;
  else
    update public.venue_slots
    set status = 'open'
    where id = v_slot_id
      and status = 'reserved';
  end if;
end;
$$;

create or replace function public.cancel_venue_booking_safely(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slot_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select b.slot_id into v_slot_id
  from public.venue_booking_requests b
  where b.id = p_booking_id
    and b.requester_id = auth.uid();

  if v_slot_id is null then
    raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = '22023';
  end if;

  perform 1
  from public.venue_slots s
  where s.id = v_slot_id
  for update;

  perform 1
  from public.venue_booking_requests b
  where b.id = p_booking_id
    and b.requester_id = auth.uid()
    and b.status = 'pending'
  for update;

  if not found then
    raise exception 'BOOKING_NOT_CANCELLABLE' using errcode = '22023';
  end if;

  update public.venue_booking_requests
  set status = 'cancelled',
      cancelled_at = now()
  where id = p_booking_id;

  update public.venue_slots
  set status = 'open'
  where id = v_slot_id
    and status = 'reserved';
end;
$$;

-- SQL38 is already applied. Replace it in this new migration so `reserved`
-- keeps the active-booking error while `blocked` remains owner-closed.
create or replace function public.close_venue_slot_safely(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_status text;
  v_starts_at timestamptz;
  v_court_name text;
  v_venue_name text;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;

  select v.owner_id, s.status, s.starts_at, c.name, v.name
    into v_owner_id, v_status, v_starts_at, v_court_name, v_venue_name
  from public.venue_slots s
  join public.venue_courts c on c.id = s.court_id
  join public.venue_profiles v on v.id = c.venue_id
  where s.id = p_slot_id
  for update of s;

  if v_owner_id is null then
    raise exception 'SLOT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner_id <> v_actor and not public.is_admin() then
    raise exception 'VENUE_OWNER_REQUIRED' using errcode = '42501';
  end if;
  if v_status = 'reserved' then
    raise exception 'SLOT_HAS_ACTIVE_BOOKING' using errcode = '55006';
  end if;
  if v_status <> 'open' then
    raise exception 'SLOT_NOT_OPEN' using errcode = '55000';
  end if;
  if exists (
    select 1
    from public.venue_booking_requests b
    where b.slot_id = p_slot_id
      and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'SLOT_HAS_ACTIVE_BOOKING' using errcode = '55006';
  end if;

  update public.venue_slots
  set status = 'blocked'
  where id = p_slot_id;

  if v_owner_id <> v_actor then
    perform audit.write_admin_event(
      'venue.slot.close',
      'venue_slot',
      p_slot_id::text,
      'ปิดช่วงเวลาของสนาม ' || coalesce(v_venue_name, '-') || ' (' || coalesce(v_court_name, '-') || ')',
      jsonb_build_object('status', v_status, 'owner_id', v_owner_id, 'starts_at', v_starts_at),
      jsonb_build_object('status', 'blocked', 'owner_id', v_owner_id, 'starts_at', v_starts_at)
    );
  end if;
end;
$$;

revoke all on function public.request_venue_booking_safely(uuid, text, text) from public;
revoke all on function public.request_venue_booking_safely(uuid, text, text) from anon;
revoke all on function public.request_venue_booking_safely(uuid, text, text) from service_role;
grant execute on function public.request_venue_booking_safely(uuid, text, text) to authenticated;

revoke all on function public.respond_venue_booking_safely(uuid, text) from public;
revoke all on function public.respond_venue_booking_safely(uuid, text) from anon;
revoke all on function public.respond_venue_booking_safely(uuid, text) from service_role;
grant execute on function public.respond_venue_booking_safely(uuid, text) to authenticated;

revoke all on function public.cancel_venue_booking_safely(uuid) from public;
revoke all on function public.cancel_venue_booking_safely(uuid) from anon;
revoke all on function public.cancel_venue_booking_safely(uuid) from service_role;
grant execute on function public.cancel_venue_booking_safely(uuid) to authenticated;

revoke all on function public.close_venue_slot_safely(uuid) from public;
revoke all on function public.close_venue_slot_safely(uuid) from anon;
revoke all on function public.close_venue_slot_safely(uuid) from service_role;
grant execute on function public.close_venue_slot_safely(uuid) to authenticated;

do $$
begin
  if exists (
    select 1
    from public.venue_slots s
    join public.venue_booking_requests b on b.slot_id = s.id
    where s.status = 'open'
      and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'SQL40 open slot has an active booking';
  end if;

  if exists (
    select 1
    from public.venue_slots s
    where s.status = 'reserved'
      and not exists (
        select 1
        from public.venue_booking_requests b
        where b.slot_id = s.id
          and b.status in ('pending', 'confirmed')
      )
  ) then
    raise exception 'SQL40 reserved slot has no active booking';
  end if;

  if has_function_privilege('anon', 'public.request_venue_booking_safely(uuid,text,text)', 'execute')
     or has_function_privilege('service_role', 'public.request_venue_booking_safely(uuid,text,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.request_venue_booking_safely(uuid,text,text)', 'execute')
     or has_function_privilege('anon', 'public.respond_venue_booking_safely(uuid,text)', 'execute')
     or has_function_privilege('service_role', 'public.respond_venue_booking_safely(uuid,text)', 'execute')
     or not has_function_privilege('authenticated', 'public.respond_venue_booking_safely(uuid,text)', 'execute')
     or has_function_privilege('anon', 'public.cancel_venue_booking_safely(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.cancel_venue_booking_safely(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.cancel_venue_booking_safely(uuid)', 'execute')
     or has_function_privilege('anon', 'public.close_venue_slot_safely(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.close_venue_slot_safely(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.close_venue_slot_safely(uuid)', 'execute') then
    raise exception 'SQL40 venue RPC privilege verification failed';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
