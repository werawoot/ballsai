-- Read-only postcheck for SQL56. Check the project ref in the URL first.

select exists (select 1 from pg_trigger where tgname = 'match_results_link_fixture' and not tgisinternal) as link_trigger,
       exists (select 1 from pg_trigger where tgname = 'match_results_unlink_fixture' and not tgisinternal) as unlink_trigger,
       has_function_privilege('authenticated', 'public.set_fixture_winner_safely(uuid, text, uuid)', 'EXECUTE') as organizer_can_pick_winner,
       has_function_privilege('authenticated', 'public.advance_fixture_winner(uuid, text, uuid)', 'EXECUTE') as client_can_advance;
-- Expected: true, true, true, false.

-- Then on Staging, with a test tournament of four confirmed teams:
--   1. Draw a knockout on /dashboard/tournaments/<id>/fixtures.
--   2. Record the two semi-finals on /dashboard/results: the final shows both winners.
--   3. Record a drawn final: the page offers "choose the winner"; choose one.
--   4. Void a semi-final: refused while the final has a result; void the final first,
--      then the semi-final: its winner leaves the final.
