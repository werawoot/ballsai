-- Read-only precheck for SQL72. Read the Project ID in Settings > General first.
-- Expected before SQL72 (Staging and Production): prerequisites true, plans_table false,
-- save_fn false, type_list_has_plan false.

select to_regprocedure('public.create_notification(uuid, text, text, text, text, text)') is not null
         and to_regprocedure('public.can_view_team_events(uuid)') is not null
         and to_regclass('public.team_announcements') is not null as prerequisites,
       to_regclass('public.team_training_plans') is not null as plans_table,
       to_regprocedure('public.save_team_training_plan(uuid, date, jsonb, boolean)') is not null as save_fn,
       coalesce((select pg_get_constraintdef(c.oid) like '%team_training_plan%' from pg_constraint c
                 where c.conname = 'notifications_notification_type_check'), false) as type_list_has_plan;
