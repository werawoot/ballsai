-- Read-only precheck for SQL58. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select to_regclass('public.public_athlete_rankings') is not null as sql52_applied,
       not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'public'
                     and d.defaclobjtype = 'f' and d.defaclacl::text like '%anon=X%') as sql50_applied,
       to_regprocedure('public.public_athlete_age(uuid)') is null
         and to_regprocedure('public.my_athlete_private()') is null
         and to_regclass('public.public_athlete_directory') is null as names_free,
       has_column_privilege('anon', 'public.athlete_profiles', 'birth_date', 'SELECT') as anon_reads_birth_date_now;
-- Expected: true, true, true, true (the last one is the leak SQL58 closes).

-- Views that read birth_date or guardian_consent_at as the caller would stop working for
-- signed-out and signed-in visitors. SQL58 recreates public_athlete_rankings itself.
select distinct v.oid::regclass as view_name,
       coalesce('security_invoker=true' = any (v.reloptions), false) as runs_as_caller
from pg_depend d
join pg_rewrite r on r.oid = d.objid
join pg_class v on v.oid = r.ev_class
join pg_attribute a on a.attrelid = d.refobjid and a.attnum = d.refobjsubid
where d.refobjid = 'public.athlete_profiles'::regclass
  and a.attname in ('birth_date', 'guardian_consent_at')
  and v.oid <> 'public.public_athlete_rankings'::regclass;
-- Expected: no rows. A row with runs_as_caller true: STOP and report it.

-- Functions that run as the caller and mention these columns (triggers excluded: a
-- trigger reads the new row, which needs no SELECT privilege).
select p.oid::regprocedure as function_name
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and not p.prosecdef and p.prorettype <> 'trigger'::regtype
  and (p.prosrc ilike '%birth_date%' or p.prosrc ilike '%guardian_consent_at%');
-- Expected: no rows. Any row: STOP and report it.
