-- Read-only precheck for SQL88, same project.
-- Expected: sql86 true; new_helper false; fingerprints
-- 'notify_athlete_and_guardians:0a905d63 notify_athlete_family:07f1bd9d notify_badge_earned:c298f67e
-- notify_hall_of_fame_entry:ebdebcfc notify_match_performance_created:afe40cce
-- notify_match_result_created:1e98dbe7 notify_match_result_voided:c029a640'
-- (sql/86, sql/83 and sql/17 as written); notifications noted.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text)') is not null
         and exists (select 1 from pg_trigger where tgname = 'match_performance_notify_family' and not tgisinternal) as sql86,
       to_regprocedure('public.notify_athlete_family(uuid,text,text,text,text,text,text,text)') is not null as new_helper,
       (select string_agg(p.proname || ':' || left(md5(regexp_replace(regexp_replace(p.prosrc, '-' || '-[^' || chr(10) || ']{0,}', '', 'g'), '[[:space:]]+', '', 'g')), 8), ' ' order by p.proname, p.oid)
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('notify_athlete_family', 'notify_athlete_and_guardians', 'notify_match_performance_created',
           'notify_match_result_voided', 'notify_badge_earned', 'notify_hall_of_fame_entry', 'notify_match_result_created')) as fingerprints,
       (select count(id) from public.notifications) as notifications;
