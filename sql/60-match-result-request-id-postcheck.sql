-- Read-only postcheck for SQL60. Check the project ref in the URL first.

select has_function_privilege('authenticated', 'public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)', 'EXECUTE') as organizers_can_call,
       has_function_privilege('anon', 'public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)', 'EXECUTE') as public_can_call,
       has_table_privilege('authenticated', 'public.match_result_submissions', 'SELECT') as clients_read_submissions;
-- Expected: true, false, false.

-- Then on the site, in a disposable test tournament: preview a 0-0 draw between two
-- teams, press "confirm" twice quickly (or confirm, then confirm again). Exactly one
-- result appears in /dashboard/results, and the second answer carries the same result
-- number. With test JWTs, npm run test:concurrency does the same with parallel requests.
