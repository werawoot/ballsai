-- Rollback for SQL90. Removes only the two search indexes; the search keeps working,
-- reading every row. pg_trgm stays installed: other objects may use it.

begin;
drop index if exists public.tournaments_name_trgm_idx;
drop index if exists public.tournaments_location_trgm_idx;
commit;
