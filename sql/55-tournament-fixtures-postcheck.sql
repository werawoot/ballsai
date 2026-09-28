-- Read-only postcheck for SQL55. Check the project ref in the URL first.

select c.relrowsecurity as rls_on,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('authenticated', c.oid, 'INSERT') as authenticated_insert,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_function_privilege('authenticated', 'public.save_tournament_fixtures_safely(uuid, jsonb)', 'EXECUTE') as authenticated_save,
       has_function_privilege('anon', 'public.save_tournament_fixtures_safely(uuid, jsonb)', 'EXECUTE') as anon_save
from pg_class c where c.oid = 'public.tournament_fixtures'::regclass;
-- Expected: true, true, false, false, true, false.

-- Then on the site, as an organizer with a tournament that has confirmed teams:
--   /dashboard/tournaments/<id>/fixtures -> choose a format -> create the draw; create it
--   again with another format (it replaces the first). Signed in as another organizer,
--   the same page must refuse.
