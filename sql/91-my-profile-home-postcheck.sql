-- Read-only postcheck for SQL91, same project.
-- Expected: fn, auth_calls true; anon_calls, definer false; fingerprint equal on Staging and
-- Production to runbook row 91. Run here as postgres the function returns the empty
-- shape (no signed-in user); the athlete's view is checked in the app on /profile.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.my_profile_home(text, text)') is not null as fn,
       has_function_privilege('authenticated', 'public.my_profile_home(text, text)', 'execute') as auth_calls,
       has_function_privilege('anon', 'public.my_profile_home(text, text)', 'execute') as anon_calls,
       (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'my_profile_home') as definer,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'my_profile_home') as fingerprints;
