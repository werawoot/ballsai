-- Read-only precheck for SQL92, same project.
-- Expected: deps true; fn_exists false.
-- No backslash or asterisk, so it survives copy and paste from chat.

select to_regprocedure('public.my_entry_rosters(integer)') is not null
       and to_regprocedure('public.my_team_memberships(integer)') is not null
       and to_regprocedure('public.my_upcoming_team_events(integer)') is not null
       and to_regprocedure('public.my_children_team_memberships()') is not null
       and to_regprocedure('public.my_team_announcements(integer)') is not null
       and to_regprocedure('public.my_team_training_plans()') is not null
       and to_regprocedure('public.my_coach_notes(integer)') is not null
       and to_regprocedure('public.my_match_minutes()') is not null
       and to_regprocedure('public.my_staff_teams()') is not null
       and to_regprocedure('public.my_team_staff()') is not null as deps,
       to_regprocedure('public.my_team_hub()') is not null as fn_exists;
