-- Read-only precheck for SQL50. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.
-- It reports state and authorises nothing.

select current_user as runs_as;
-- Expected: postgres. SQL50 refuses to run as any other role.

-- Every SECURITY DEFINER function SQL50 would consider, with who can call it today.
-- allowlisted = true rows keep their anon access; every other anon_exec = true row is
-- what SQL50 revokes.
-- owner: SQL50 changes only functions owned by postgres (a REVOKE removes only grants the
-- running role made). Any anon_exec = true row with another owner is reported by SQL50 as
-- left unchanged; decide separately what to do with it.
select n.nspname,
       p.proname || '(' || replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',') || ')' as signature,
       pg_get_userbyid(p.proowner) as owner,
       (n.nspname = 'public' and p.proname || '(' || replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',') || ')' in
         ('is_admin()', 'is_organizer()', 'is_accepted_guardian_for(uuid)',
          'confirm_guardian_verification(text)', 'revoke_guardian_consent(text,text)')) as allowlisted,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec,
       has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'audit') and p.prokind = 'f' and p.prosecdef
  and not exists (select 1 from pg_depend d
                  where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
order by anon_exec desc, allowlisted, 1, 2;

-- Today's default privileges for functions (who gets EXECUTE on a new function).
select pg_get_userbyid(d.defaclrole) as for_objects_created_by, n.nspname as in_schema,
       d.defaclacl::text as default_grants
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
order by 1, 2;
