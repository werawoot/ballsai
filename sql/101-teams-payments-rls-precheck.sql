-- Read-only precheck for SQL101, the project you are on.
-- Expected on Production (21 Nov 2026): rls all true, fns true, teams_policies the two "Players can"
-- names, payments_policies the four old names, tournaments_policies five names (three old),
-- teams 3, payments 0. On Staging: the sql/supabase-rls.sql names only.
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select bool_and(relrowsecurity) from pg_class where oid in ('public.teams'::regclass, 'public.payments'::regclass, 'public.tournaments'::regclass)) as rls,
       (to_regprocedure('public.is_admin()') is not null and to_regprocedure('public.is_organizer()') is not null) as fns,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.teams'::regclass) as teams_policies,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.payments'::regclass) as payments_policies,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.tournaments'::regclass) as tournaments_policies,
       (select count(1) from public.teams) as teams,
       (select count(1) from public.payments) as payments;
