-- Read-only postcheck for SQL100, the project you are on.
-- Expected on both: all three not_null true; teams and tournaments equal to the precheck.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select attnotnull from pg_attribute where attrelid = 'public.teams'::regclass and attname = 'status') as teams_status_not_null,
       (select attnotnull from pg_attribute where attrelid = 'public.teams'::regclass and attname = 'created_by') as teams_created_by_not_null,
       (select attnotnull from pg_attribute where attrelid = 'public.tournaments'::regclass and attname = 'status') as tournaments_status_not_null,
       (select count(1) from public.teams) as teams,
       (select count(1) from public.tournaments) as tournaments;
