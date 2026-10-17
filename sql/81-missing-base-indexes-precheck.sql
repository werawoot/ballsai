-- Read-only precheck for SQL81. Read the Project ID in Settings > General first.
-- Expected on Production (17 Oct 2026): tables true, duplicate_entries 0; registration_idx,
-- teams_tournament_idx, payments_tournament_idx, tournaments_organizer_idx false;
-- draft_idx true. On Staging: those four true and draft_idx false. Stop if
-- duplicate_entries is above 0.

select to_regclass('public.teams') is not null and to_regclass('public.payments') is not null
         and to_regclass('public.tournaments') is not null as tables,
       (select count(1) from (select 1 from public.teams where tournament_id is not null group by tournament_id, created_by having count(1) > 1) d) as duplicate_entries,
       to_regclass('public.teams_one_registration_per_user_per_tournament_idx') is not null as registration_idx,
       to_regclass('public.teams_tournament_id_idx') is not null as teams_tournament_idx,
       to_regclass('public.payments_tournament_id_idx') is not null as payments_tournament_idx,
       to_regclass('public.tournaments_organizer_id_idx') is not null as tournaments_organizer_idx,
       to_regclass('public.teams_tournament_draft_idx') is not null as draft_idx,
       (select count(id) from public.teams) as teams;
