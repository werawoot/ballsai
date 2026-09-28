-- READ-ONLY. Run in the Supabase SQL Editor of ONE project; check the project ref in the URL first.
-- Production: hivedzrwrrcnjrlirhtv   Staging: vorpnkedpscsqhnrssrl
-- 1) Can browser roles create objects in public? If yes, a SECURITY DEFINER function whose
--    search_path starts with public could be made to call an object the browser created.
select has_schema_privilege('anon', 'public', 'CREATE') as anon_can_create_in_public,
       has_schema_privilege('authenticated', 'public', 'CREATE') as authenticated_can_create_in_public;

-- 2) Default privileges: which roles automatically receive EXECUTE on functions created
--    later in public. An entry granting anon EXECUTE is why new functions keep appearing
--    as anon-executable until each file revokes it by name.
select pg_get_userbyid(d.defaclrole) as for_objects_created_by,
       n.nspname as in_schema,
       d.defaclobjtype as object_type,
       d.defaclacl::text as default_grants
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
order by 1, 2;
