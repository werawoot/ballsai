-- Read-only precheck for SQL59. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.

select to_regclass('public.public_ranking_provinces') is null as name_free,
       has_table_privilege('anon', 'public.player_ranks', 'SELECT') as anon_reads_ranks,
       (select count(*) from public.player_ranks) as ranked_rows;
-- Expected: true, true, and the row count (a plain CREATE INDEX blocks writes while it
-- builds; with tens of thousands of rows build it CONCURRENTLY outside a transaction).
