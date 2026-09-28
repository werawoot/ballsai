-- Read-only postcheck for SQL54. Check the project ref in the URL first.

select p.prosecdef as security_definer,
       p.prosrc like '%venue_booking_cancel_agreed:%' as agreed_cancel_branch,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'notify_venue_booking_responded';
-- Expected: true, true, false, false.

-- Then, with two test accounts on Staging (a venue owner and a requester):
--   1. The requester withdraws a pending request: the owner gets "ผู้ขอยกเลิกคำขอจอง".
--   2. On a confirmed booking the owner proposes a cancellation and the requester accepts:
--      the owner gets "การจองถูกยกเลิกแล้ว"; the requester does not get a cancellation notice
--      for their own action.
--   3. The reverse (requester proposes, owner accepts): the requester gets "การจองถูกยกเลิกแล้ว".
