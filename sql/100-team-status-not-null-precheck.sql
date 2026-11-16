-- Read-only precheck for SQL100, the project you are on.
-- Expected on Production (16 Nov 2026): not_null all three false; null_rows 0 0 0.
-- Expected on Staging: teams_status and tournaments_status true, teams_created_by false;
-- null_rows 0 0 0. Note the three not_null values: the rollback puts back only what was false.
-- If any null_rows value is above 0, STOP: the file would refuse anyway.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select attnotnull from pg_attribute where attrelid = 'public.teams'::regclass and attname = 'status') as teams_status_not_null,
       (select attnotnull from pg_attribute where attrelid = 'public.teams'::regclass and attname = 'created_by') as teams_created_by_not_null,
       (select attnotnull from pg_attribute where attrelid = 'public.tournaments'::regclass and attname = 'status') as tournaments_status_not_null,
       (select count(1) from public.teams where status is null) as teams_null_status,
       (select count(1) from public.teams where created_by is null) as teams_null_created_by,
       (select count(1) from public.tournaments where status is null) as tournaments_null_status,
       (select count(1) from public.teams) as teams,
       (select count(1) from public.tournaments) as tournaments;
