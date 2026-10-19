-- Read-only precheck for SQL86, same project.
-- Expected: prerequisites true; type_list_current true (the sql/72 list, no hall_of_fame yet);
-- old_triggers true (sql/17's badge and team status triggers in place); new_triggers false.
-- Note the fingerprints of the two sql/17 functions SQL86 replaces (sql/17 as written:
-- notify_badge_earned 3f7e282e, notify_team_status_changed 6a87ddd8) and notifications.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regclass('public.notifications') is not null
         and to_regclass('public.guardian_links') is not null
         and to_regclass('public.match_player_performances') is not null
         and to_regclass('public.athlete_badges') is not null
         and to_regclass('public.hall_of_fame_entries') is not null
         and to_regprocedure('public.create_notification(uuid,text,text,text,text,text)') is not null
         and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'player_ranks' and column_name = 'player_id')
         and to_regclass('public.match_player_performances_match_idx') is not null
         and to_regclass('public.guardian_links_athlete_status_idx') is not null as prerequisites,
       (select pg_get_constraintdef(c.oid) like '%team_training_plan%' and pg_get_constraintdef(c.oid) not like '%hall_of_fame%'
          from pg_constraint c where c.conrelid = 'public.notifications'::regclass and c.conname = 'notifications_notification_type_check') as type_list_current,
       exists (select 1 from pg_trigger where tgname = 'athlete_badge_notify_earned' and not tgisinternal)
         and exists (select 1 from pg_trigger where tgname = 'team_notify_status_changed' and not tgisinternal) as old_triggers,
       exists (select 1 from pg_trigger where tgname in ('match_performance_notify_family', 'match_result_notify_voided', 'hall_of_fame_notify_entry') and not tgisinternal) as new_triggers,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('notify_badge_earned', 'notify_team_status_changed')) as old_fingerprints,
       (select count(id) from public.notifications) as notifications;
