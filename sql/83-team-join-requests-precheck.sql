-- Read-only precheck for SQL83, same project.
-- Expected: prerequisites true; status_checks = team_members_status_check (one name only);
-- join_tables false; members_text = the number of teams whose free-text roster is not empty
-- (SQL83 clears them); teams, members unchanged by the apply.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.team_members') is not null
         and to_regclass('public.guardian_links') is not null
         and to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null
         and to_regprocedure('public.manage_coach_beta(text,uuid,jsonb)') is not null
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'teams' and column_name = 'kind')
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'province') as prerequisites,
       (select string_agg(c.conname, ',' order by c.conname) from pg_constraint c
         where c.conrelid = 'public.team_members'::regclass and c.contype = 'c'
           and pg_get_constraintdef(c.oid) like '%status%') as status_checks,
       to_regclass('public.team_join_requests') is not null or to_regclass('public.team_join_links') is not null as join_tables,
       (select count(id) from public.teams where members is distinct from '') as members_text,
       (select count(id) from public.teams) as teams,
       (select count(id) from public.team_members) as members;
