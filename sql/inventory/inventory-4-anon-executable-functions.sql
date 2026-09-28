-- READ-ONLY. Run in the Supabase SQL Editor of ONE project; check the project ref in the URL first.
-- Production: hivedzrwrrcnjrlirhtv   Staging: vorpnkedpscsqhnrssrl

-- SQL39 and [beta] SQL26: guarded RPCs should not be executable by anon. Every row should be
-- anon_exec = false. Functions granted to anon on purpose (guardian email links,
-- is_admin/is_organizer used inside RLS) are excluded.
select p.proname, pg_get_function_identity_arguments(p.oid) as args,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and p.proname not in ('confirm_guardian_verification', 'revoke_guardian_consent', 'is_admin', 'is_organizer')
  and has_function_privilege('anon', p.oid, 'EXECUTE')
order by p.proname;
