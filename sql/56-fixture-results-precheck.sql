-- Read-only precheck for SQL56. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select to_regclass('public.tournament_fixtures') is not null as sql55_applied,
       exists (select 1 from pg_proc where proname = 'void_match_result_safely') as void_applied,
       exists (select 1 from pg_trigger where tgname in ('match_results_link_fixture', 'match_results_unlink_fixture')) as sql56_already;
-- Expected: true, true, false. sql56_already true means SQL56 is in: do not run it again.

select tgname, pg_get_triggerdef(oid) as definition
from pg_trigger where tgrelid = to_regclass('public.match_results') and not tgisinternal
order by 1;
-- Record every trigger on match_results. SQL56 adds two AFTER triggers and changes none.
