-- Read-only postcheck for SQL81, same project.
-- Expected: all_indexes true, registration_unique true, teams equal to the precheck.

select to_regclass('public.teams_one_registration_per_user_per_tournament_idx') is not null
         and to_regclass('public.teams_tournament_id_idx') is not null
         and to_regclass('public.payments_tournament_id_idx') is not null
         and to_regclass('public.tournaments_organizer_id_idx') is not null
         and to_regclass('public.teams_tournament_draft_idx') is not null as all_indexes,
       coalesce((select i.indisunique from pg_index i where i.indexrelid = to_regclass('public.teams_one_registration_per_user_per_tournament_idx')), false) as registration_unique,
       (select count(id) from public.teams) as teams;
