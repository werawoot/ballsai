-- Read-only precheck for SQL71. Read the Project ID in Settings > General first.
-- Expected before SQL71 (Staging and Production): prerequisites true, announcements_table
-- false, post_fn false, reminded_col false, type_list_has_announcement false.

select to_regclass('public.notifications') is not null
         and to_regprocedure('public.create_notification(uuid, text, text, text, text, text)') is not null
         and to_regclass('public.team_events') is not null
         and to_regprocedure('public.is_team_creator(uuid)') is not null as prerequisites,
       to_regclass('public.team_announcements') is not null as announcements_table,
       to_regprocedure('public.post_team_announcement(uuid, uuid, text, boolean, boolean)') is not null as post_fn,
       exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'team_events' and column_name = 'reminded_at') as reminded_col,
       coalesce((select pg_get_constraintdef(c.oid) like '%team_announcement%' from pg_constraint c
                 where c.conname = 'notifications_notification_type_check'), false) as type_list_has_announcement;
