-- 38-close-venue-slot-v1.sql
-- Lets a venue owner close an accidentally published open slot.
-- Active pending/confirmed bookings are protected from being orphaned.
-- An admin may close another owner's slot, and that override is written to the
-- SQL35 admin audit trail in the same transaction.
-- Apply to Supabase project hivedzrwrrcnjrlirhtv only, after SQL23, SQL33 and SQL35.

begin;

-- Fail fast instead of creating a function that only breaks at call time.
do $$
begin
  if to_regclass('public.venue_slots') is null
     or to_regclass('public.venue_courts') is null
     or to_regclass('public.venue_profiles') is null
     or to_regclass('public.venue_booking_requests') is null then
    raise exception 'SQL38 requires the venue tables from SQL23';
  end if;
  if to_regprocedure('public.is_admin()') is null then
    raise exception 'SQL38 missing required function: public.is_admin()';
  end if;
  if to_regprocedure('audit.write_admin_event(text, text, text, text, jsonb, jsonb)') is null then
    raise exception 'SQL38 requires the admin audit trail from SQL35';
  end if;
end;
$$;

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
  -- 55000 object_not_in_prerequisite_state: the slot is not in a closable state.
  if v_status <> 'open' then
    raise exception 'SLOT_NOT_OPEN' using errcode = '55000';
  end if;
  -- 55006 object_in_use: a live booking still depends on this slot.
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

  -- Only an admin acting on someone else's venue is an override worth auditing.
  -- This runs in the same transaction, so a failed audit rolls the close back.
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

revoke all on function public.close_venue_slot_safely(uuid) from public;
revoke all on function public.close_venue_slot_safely(uuid) from anon;
revoke all on function public.close_venue_slot_safely(uuid) from service_role;
grant execute on function public.close_venue_slot_safely(uuid) to authenticated;

do $$
begin
  if has_function_privilege('anon', 'public.close_venue_slot_safely(uuid)', 'execute')
     or has_function_privilege('service_role', 'public.close_venue_slot_safely(uuid)', 'execute')
     or not has_function_privilege('authenticated', 'public.close_venue_slot_safely(uuid)', 'execute') then
    raise exception 'close_venue_slot_safely privilege verification failed';
  end if;
end;
$$;

commit;
