-- Read-only precheck for SQL89, same project.
-- Expected: deps true; requests_exists false; status_values only open and closed (a row with
-- another status would make SQL89 roll back); status_checks lists the check that SQL89
-- replaces (record it in the runbook row); status_default open; admins 1 or more.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.team_members') is not null
       and to_regclass('public.guardian_links') is not null
       and to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null
       and to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text,text,text)') is not null
       and exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass
                   and tgname = 'profiles_guard_privileged_columns') as deps,
       to_regclass('public.organizer_requests') is not null as requests_exists,
       (select string_agg(coalesce(status, 'null') || ':' || n, ', ' order by status)
          from (select status, count(1) as n from public.tournaments group by status) s) as status_values,
       (select string_agg(conname || ' = ' || pg_get_constraintdef(oid), ' | ')
          from pg_constraint where conrelid = 'public.tournaments'::regclass and contype = 'c') as status_checks,
       (select column_default from information_schema.columns
         where table_schema = 'public' and table_name = 'tournaments' and column_name = 'status') as status_default,
       (select count(1) from public.profiles where role = 'admin') as admins,
       (select count(1) from public.profiles where role = 'organizer') as organizers;
