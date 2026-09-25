-- 39-venue-rpc-privilege-hardening-postcheck.sql
-- READ-ONLY verification for SQL39. Run only against Ballsai project
-- hivedzrwrrcnjrlirhtv after SQL39 has been explicitly approved and applied.
-- Expected for every row: anon_can_execute = false,
-- service_role_can_execute = false, authenticated_can_execute = true.

select
  function_signature,
  has_function_privilege('anon', function_signature, 'execute') as anon_can_execute,
  has_function_privilege('service_role', function_signature, 'execute') as service_role_can_execute,
  has_function_privilege('authenticated', function_signature, 'execute') as authenticated_can_execute
from unnest(array[
  'public.create_venue_profile_safely(text, text, text, text, text, text[])',
  'public.create_venue_court_safely(uuid, text, text, text, integer)',
  'public.create_venue_slot_safely(uuid, timestamptz, timestamptz, integer)',
  'public.request_venue_booking_safely(uuid, text, text)',
  'public.respond_venue_booking_safely(uuid, text)',
  'public.cancel_venue_booking_safely(uuid)'
]) as functions(function_signature)
order by function_signature;
