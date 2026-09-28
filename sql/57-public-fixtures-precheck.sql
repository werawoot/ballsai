-- Read-only precheck for SQL57. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select exists (select 1 from information_schema.columns where table_schema = 'public'
               and table_name = 'tournament_fixtures' and column_name = 'winner_team_id') as sql56_applied,
       not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'public'
                     and d.defaclobjtype = 'f' and d.defaclacl::text like '%anon=X%') as sql50_applied,
       to_regprocedure('public.public_tournament_fixtures(uuid)') is null as name_free;
-- Expected: true, true, true. If sql50_applied is false, apply SQL50 first (it would
-- otherwise take signed-out access away from the public reader SQL57 creates).
