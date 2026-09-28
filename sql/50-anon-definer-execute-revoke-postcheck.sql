-- Read-only postcheck for SQL50. Check the project ref in the URL first.

select n.nspname,
       p.proname || '(' || replace(pg_catalog.oidvectortypes(p.proargtypes), ', ', ',') || ')' as signature,
       pg_get_userbyid(p.proowner) as owner,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname in ('public', 'audit') and p.prokind = 'f' and p.prosecdef
  and has_function_privilege('anon', p.oid, 'EXECUTE')
  and not exists (select 1 from pg_depend d
                  where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
order by 1, 2;
-- Expected: among functions owned by postgres, at most five rows, all in public:
-- is_admin(), is_organizer(), is_accepted_guardian_for(uuid),
-- confirm_guardian_verification(text), revoke_guardian_consent(text,text). Rows owned by
-- another role are the ones SQL50 reported as left unchanged. Any other postgres-owned row:
-- STOP and reconcile.

select pg_get_userbyid(d.defaclrole) as for_objects_created_by, n.nspname as in_schema,
       d.defaclacl::text as default_grants
from pg_default_acl d left join pg_namespace n on n.oid = d.defaclnamespace
where d.defaclobjtype = 'f'
order by 1, 2;
-- Expected for postgres in public: authenticated has X (EXECUTE); neither anon nor
-- PUBLIC (=X with no role name) does.
-- Then, signed out: open /players/<a public athlete>, /ranking and /athletes, and follow a
-- guardian verification link. Signed in: record a booking and a team invite. All must
-- still work.
