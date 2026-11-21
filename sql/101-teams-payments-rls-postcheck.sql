-- Read-only postcheck for SQL101, the project you are on.
-- Expected on both projects: the same three lists, and the same fingerprint on Staging and
-- Production (every policy's name, command, roles, using and check on the three tables).
-- teams_policies: teams_insert_creator_for_open_tournament | teams_select_owner_organizer_admin | teams_update_organizer_admin
-- payments_policies: payments_insert_owner_for_own_team | payments_select_owner_organizer_admin | payments_update_organizer_admin
-- tournaments_policies: tournaments_insert_organizer | tournaments_select_public | tournaments_update_owner_or_admin
-- No backslash or asterisk, so it survives copy and paste from chat.

select (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.teams'::regclass) as teams_policies,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.payments'::regclass) as payments_policies,
       (select string_agg(polname, ' | ' order by polname) from pg_policy where polrelid = 'public.tournaments'::regclass) as tournaments_policies,
       (select left(md5(string_agg(c.relname || ':' || p.polname || ':' || p.polcmd::text || ':' || p.polpermissive::text || ':'
                 || coalesce(array_to_string(array(select r.rolname from pg_roles r where r.oid = any(p.polroles) order by r.rolname), ','), '')
                 || ':' || coalesce(pg_get_expr(p.polqual, p.polrelid), '') || ':' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), ''),
                 '/' order by c.relname, p.polname)), 8)
          from pg_policy p join pg_class c on c.oid = p.polrelid
          where c.oid in ('public.teams'::regclass, 'public.payments'::regclass, 'public.tournaments'::regclass)) as fingerprint;
