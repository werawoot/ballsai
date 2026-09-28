-- Read-only postcheck for SQL52. Check the project ref in the URL first.

select c.relname, c.reloptions,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('anon', c.oid, 'INSERT') or has_table_privilege('anon', c.oid, 'UPDATE')
         or has_table_privilege('anon', c.oid, 'DELETE') as anon_writes
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname = 'public_athlete_rankings';
-- Expected: one row, reloptions {security_invoker=true}, anon_select true, anon_writes false.

select count(*) as rows_in_view,
       (select count(*) from public.athlete_profiles where is_public) as public_profiles
from public.public_athlete_rankings;
-- Expected: rows_in_view <= public_profiles times the seasons they have ranks in.

explain select id from public.public_athlete_rankings
where sport = 'football' and season = '2026'
order by mvps desc, goals desc, pts desc, id limit 50;
-- Then open /ranking?view=emerging and /ranking?view=mvp signed out. Both must load, and
-- the server log must not show public_identity_ranking_view_missing.
