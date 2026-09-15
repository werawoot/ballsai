-- 39-venue-rpc-privilege-hardening-v1.sql
-- Closes Supabase default EXECUTE grants left on the SQL23 venue RPCs.
-- Apply only to Ballsai project hivedzrwrrcnjrlirhtv after explicit owner approval.
-- Depends on SQL23. This does not alter booking or venue data, function bodies,
-- RLS policies, or the venue-owner flow. It only limits RPC invocation to
-- authenticated users, matching the existing application flow.

begin;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_venue_profile_safely(text, text, text, text, text, text[])',
    'public.create_venue_court_safely(uuid, text, text, text, integer)',
    'public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer)',
    'public.request_venue_booking_safely(uuid, text, text)',
    'public.respond_venue_booking_safely(uuid, text)',
    'public.cancel_venue_booking_safely(uuid)'
  ] loop
    if to_regprocedure(v_signature) is null then
      raise exception 'SQL39 missing required venue RPC: %', v_signature;
    end if;
  end loop;
end;
$$;

revoke all on function public.create_venue_profile_safely(text, text, text, text, text, text[]) from public, anon, service_role;
revoke all on function public.create_venue_court_safely(uuid, text, text, text, integer) from public, anon, service_role;
revoke all on function public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer) from public, anon, service_role;
revoke all on function public.request_venue_booking_safely(uuid, text, text) from public, anon, service_role;
revoke all on function public.respond_venue_booking_safely(uuid, text) from public, anon, service_role;
revoke all on function public.cancel_venue_booking_safely(uuid) from public, anon, service_role;

grant execute on function public.create_venue_profile_safely(text, text, text, text, text, text[]) to authenticated;
grant execute on function public.create_venue_court_safely(uuid, text, text, text, integer) to authenticated;
grant execute on function public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer) to authenticated;
grant execute on function public.request_venue_booking_safely(uuid, text, text) to authenticated;
grant execute on function public.respond_venue_booking_safely(uuid, text) to authenticated;
grant execute on function public.cancel_venue_booking_safely(uuid) to authenticated;

do $$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.create_venue_profile_safely(text, text, text, text, text, text[])',
    'public.create_venue_court_safely(uuid, text, text, text, integer)',
    'public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer)',
    'public.request_venue_booking_safely(uuid, text, text)',
    'public.respond_venue_booking_safely(uuid, text)',
    'public.cancel_venue_booking_safely(uuid)'
  ] loop
    if has_function_privilege('anon', v_signature, 'execute')
       or has_function_privilege('service_role', v_signature, 'execute')
       or not has_function_privilege('authenticated', v_signature, 'execute') then
      raise exception 'SQL39 privilege verification failed for %', v_signature;
    end if;
  end loop;
end;
$$;

commit;
