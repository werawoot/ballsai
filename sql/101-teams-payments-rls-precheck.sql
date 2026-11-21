-- Read-only precheck for SQL101, the project you are on.
-- Expected on Production (21 Nov 2026): rls all true, fns true, teams_policies the two "Players can"
-- names, payments_policies the four old names, tournaments_policies five names (three old),
-- teams 3, payments 0. On Staging: the sql/supabase-rls.sql names only. On both: unknown_policies
-- empty (any other policy name on the three tables would keep a hole SQL101 does not close: stop
-- and review it first), indexes 5 (the ones the new policies' lookups use, from sql/supabase-rls.sql).
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select bool_and(relrowsecurity) from pg_class where oid in ('public.teams'::regclass, 'public.payments'::regclass, 'public.tournaments'::regclass)) as rls,
       (to_regprocedure('public.is_admin()') is not null and to_regprocedure('public.is_organizer()') is not null) as fns,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.teams'::regclass) as teams_policies,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.payments'::regclass) as payments_policies,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.tournaments'::regclass) as tournaments_policies,
       (select count(1) from public.teams) as teams,
       (select count(1) from public.payments) as payments,
       (select string_agg(polname, ' | ' order by polname) from pg_policy
          where polrelid in ('public.teams'::regclass, 'public.payments'::regclass, 'public.tournaments'::regclass)
            and polname not in ('Players can create teams', 'Players can view own teams', 'Users can insert own payments',
              'Users can view own payments', 'Organizers can view payments for their tournaments', 'Organizers can update payment status',
              'Anyone can view tournaments', 'Organizer can create tournaments', 'Organizer can update own tournaments',
              'teams_select_owner_organizer_admin', 'teams_insert_creator_for_open_tournament', 'teams_update_organizer_admin',
              'payments_select_owner_organizer_admin', 'payments_insert_owner_for_own_team', 'payments_update_organizer_admin',
              'tournaments_insert_organizer', 'tournaments_select_public', 'tournaments_update_owner_or_admin')) as unknown_policies,
       (select count(1) from pg_indexes where schemaname = 'public' and indexname in ('teams_one_registration_per_user_per_tournament_idx',
          'payments_one_payment_per_team_idx', 'teams_tournament_id_idx', 'payments_tournament_id_idx', 'tournaments_organizer_id_idx')) as indexes;
