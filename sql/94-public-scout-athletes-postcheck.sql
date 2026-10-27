-- Read-only postcheck for SQL94, same project.
-- Expected: fn true; definer false; anon_calls true; page_rows at most 24 and equal to
-- public_profiles when that is 24 or fewer; fingerprint equal on Staging and Production
-- to runbook row 94. As postgres the page lists every public profile of the sport.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.public_scout_athletes(text,text,text,text,text,integer,integer,integer)') is not null as fn,
       (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'public_scout_athletes') as definer,
       has_function_privilege('anon', 'public.public_scout_athletes(text,text,text,text,text,integer,integer,integer)', 'execute') as anon_calls,
       (select count(1) from public.public_scout_athletes('football', '2026')) as page_rows,
       (select count(1) from public.athlete_profiles where is_public and sport = 'football') as public_profiles,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'public_scout_athletes') as fingerprints;
