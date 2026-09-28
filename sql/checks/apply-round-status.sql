-- Read-only: which pending migrations a database already has. Not a migration.
-- Run in the Supabase SQL Editor on Staging (vorpnkedpscsqhnrssrl) and on Production
-- (hivedzrwrrcnjrlirhtv) separately; check the project ref in the URL first. It reads the
-- catalog only: no user data, no secrets. Each row is one step of
-- docs/apply-round-2026-09.md; `present = true` means that step's objects already exist,
-- so the step is skipped (after its precheck confirms the state is the one expected).

select step, migration, present, marker from (values
  (1,  '42 notification privilege hardening',
       coalesce((select not has_function_privilege('authenticated', p.oid, 'EXECUTE')
                        and p.proconfig is not null
                 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                 where n.nspname = 'public' and p.proname = 'create_notification'), false),
       'create_notification: authenticated cannot execute, search_path pinned'),
  (2,  '41 venue booking notifications',
       exists (select 1 from pg_trigger where tgname = 'venue_booking_notify_requested' and not tgisinternal),
       'trigger venue_booking_notify_requested'),
  (3,  '44 venue photo owner policies fix',
       exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
               and policyname = 'venue_photos_owner_insert'
               and coalesce(with_check, qual) like '%foldername(objects.name)%'),
       'storage policy venue_photos_owner_insert reads objects.name'),
  (4,  'btree_gist extension (for 46)',
       exists (select 1 from pg_extension where extname = 'btree_gist'),
       'extension btree_gist'),
  (5,  '46 venue beta operations',
       to_regclass('public.venue_booking_coordination') is not null
         and to_regprocedure('public.coordinate_venue_booking_beta(text,uuid,jsonb)') is not null,
       'table venue_booking_coordination + coordinate_venue_booking_beta'),
  (6,  '47 coach beta management',
       to_regprocedure('public.manage_coach_beta(text,jsonb)') is not null
         or exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'public' and p.proname = 'manage_coach_beta'),
       'function manage_coach_beta'),
  (7,  '54 venue cancellation notices',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'notify_venue_booking_responded'
                 and p.prosrc like '%venue_booking_cancel_agreed:%'),
       'notify_venue_booking_responded has the agreed-cancel branch'),
  (8,  'match-result-void-v1',
       exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
               where n.nspname = 'public' and p.proname = 'void_match_result_safely'),
       'function void_match_result_safely'),
  (9,  'guardian-consent-enforcement-v1',
       exists (select 1 from pg_trigger where tgname = 'athlete_profiles_guardian_consent_guard' and not tgisinternal),
       'trigger athlete_profiles_guardian_consent_guard'),
  (10, '51 public list pagination indexes',
       to_regclass('public.venue_profiles_published_page_idx') is not null
         and to_regclass('public.tournaments_start_date_page_idx') is not null,
       'indexes venue_profiles_published_page_idx, tournaments_start_date_page_idx'),
  (11, '52 public athlete rankings view',
       to_regclass('public.public_athlete_rankings') is not null,
       'view public_athlete_rankings'),
  (12, '53 athletes directory index',
       to_regclass('public.athlete_profiles_directory_page_idx') is not null,
       'index athlete_profiles_directory_page_idx'),
  (13, '55 tournament fixtures',
       to_regclass('public.tournament_fixtures') is not null
         and to_regprocedure('public.save_tournament_fixtures_safely(uuid,jsonb)') is not null,
       'table tournament_fixtures + save_tournament_fixtures_safely'),
  (14, '56 fixture results',
       exists (select 1 from pg_trigger where tgname = 'match_results_link_fixture' and not tgisinternal),
       'trigger match_results_link_fixture'),
  (15, '50 anon EXECUTE off definer functions',
       not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'public'
                     and d.defaclobjtype = 'f' and d.defaclacl::text like '%anon=X%'),
       'postgres default privileges in public give anon no EXECUTE'),
  (16, '57 public fixtures (after 50)',
       to_regprocedure('public.public_tournament_fixtures(uuid)') is not null,
       'function public_tournament_fixtures'),
  (17, '58 athlete private columns (after 50)',
       not has_column_privilege('anon', 'public.athlete_profiles', 'birth_date', 'SELECT'),
       'anon cannot read athlete_profiles.birth_date')
) as status(step, migration, present, marker)
order by step;
