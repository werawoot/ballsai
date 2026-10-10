-- Read-only postcheck for SQL75, same project. One row per check.
-- Expected: staff_table, rls, auth_calls, events_updated_by, authors_set_null true;
-- anon_read, auth_direct_write, anon_calls, lock_callable false; and each fingerprint
-- equal on Staging and Production to the value in runbook row 75.

with fp as (
  select p.oid::regprocedure::text as fn,
         left(md5(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', '', 'g')), 8) as value
  from pg_proc p
  where p.oid in (
    'public.is_team_assistant(uuid)'::regprocedure, 'public.is_team_staff(uuid)'::regprocedure,
    'public.lock_team_for_staff(uuid)'::regprocedure, 'public.invite_team_staff(uuid, text)'::regprocedure,
    'public.respond_team_staff(uuid, boolean, boolean)'::regprocedure, 'public.remove_team_staff(uuid)'::regprocedure,
    'public.team_for_staff(uuid)'::regprocedure, 'public.team_staff_list(uuid)'::regprocedure,
    'public.my_staff_teams()'::regprocedure, 'public.my_team_staff()'::regprocedure,
    'public.can_view_team_events(uuid)'::regprocedure,
    'public.save_team_event(uuid, uuid, text, text, timestamp with time zone, text, text)'::regprocedure,
    'public.cancel_team_event(uuid)'::regprocedure, 'public.set_team_attendance(uuid, uuid[])'::regprocedure,
    'public.is_team_announcement_author(uuid)'::regprocedure,
    'public.post_team_announcement(uuid, uuid, text, boolean, boolean)'::regprocedure,
    'public.delete_team_announcement(uuid)'::regprocedure, 'public.remind_team_event(uuid)'::regprocedure,
    'public.save_team_training_plan(uuid, date, jsonb, boolean)'::regprocedure,
    'public.save_match_minutes(uuid, uuid, integer, jsonb)'::regprocedure
  )
)
select 'staff_table' as check_name, (to_regclass('public.team_staff') is not null)::text as value
union all select 'rls', (select relrowsecurity from pg_class where oid = 'public.team_staff'::regclass)::text
union all select 'anon_read', has_table_privilege('anon', 'public.team_staff', 'select')::text
union all select 'auth_direct_write', (has_table_privilege('authenticated', 'public.team_staff', 'insert')
    or has_table_privilege('authenticated', 'public.team_staff', 'update') or has_table_privilege('authenticated', 'public.team_staff', 'delete'))::text
union all select 'anon_calls', (has_function_privilege('anon', 'public.invite_team_staff(uuid, text)', 'execute')
    or has_function_privilege('anon', 'public.my_team_staff()', 'execute') or has_function_privilege('anon', 'public.team_staff_list(uuid)', 'execute'))::text
union all select 'lock_callable', has_function_privilege('authenticated', 'public.lock_team_for_staff(uuid)', 'execute')::text
union all select 'auth_calls', (has_function_privilege('authenticated', 'public.invite_team_staff(uuid, text)', 'execute')
    and has_function_privilege('authenticated', 'public.respond_team_staff(uuid, boolean, boolean)', 'execute')
    and has_function_privilege('authenticated', 'public.remove_team_staff(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.team_for_staff(uuid)', 'execute')
    and has_function_privilege('authenticated', 'public.my_team_staff()', 'execute'))::text
union all select 'events_updated_by', exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'team_events' and column_name = 'updated_by')::text
union all select 'authors_set_null', ((select count(*) from pg_constraint c
    where c.contype = 'f' and c.confdeltype = 'n'
      and c.conname in ('team_events_created_by_fkey', 'team_announcements_created_by_fkey', 'team_training_plans_updated_by_fkey')) = 3)::text
union all select * from (select 'fp ' || fn, value from fp order by fn) f;
