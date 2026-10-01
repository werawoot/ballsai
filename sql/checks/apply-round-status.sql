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
       -- All three owner policies, not only insert: Staging once had insert repaired while
       -- read and delete still read the venue's name (29 Sep 2026).
       (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects'
          and policyname in ('venue_photos_owner_insert', 'venue_photos_owner_or_admin_read', 'venue_photos_owner_or_admin_delete')
          and (coalesce(qual, '') || coalesce(with_check, '')) like '%foldername(objects.name)%'
          and (coalesce(qual, '') || coalesce(with_check, '')) not like '%foldername(v.name)%') = 3,
       'all three venue photo owner policies read objects.name'),
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
  (13, '59 ranking provinces view',
       to_regclass('public.public_ranking_provinces') is not null,
       'view public_ranking_provinces'),
  (14, '60 match result request id (before 50)',
       to_regprocedure('public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)') is not null,
       'function record_match_result_once'),
  (15, '55 tournament fixtures',
       to_regclass('public.tournament_fixtures') is not null
         and to_regprocedure('public.save_tournament_fixtures_safely(uuid,jsonb)') is not null,
       'table tournament_fixtures + save_tournament_fixtures_safely'),
  (16, '56 fixture results',
       exists (select 1 from pg_trigger where tgname = 'match_results_link_fixture' and not tgisinternal),
       'trigger match_results_link_fixture'),
  (17, '50 anon EXECUTE off definer functions',
       not exists (select 1 from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
                   where pg_get_userbyid(d.defaclrole) = 'postgres' and n.nspname = 'public'
                     and d.defaclobjtype = 'f' and d.defaclacl::text like '%anon=X%'),
       'postgres default privileges in public give anon no EXECUTE'),
  (18, '57 public fixtures (after 50)',
       to_regprocedure('public.public_tournament_fixtures(uuid)') is not null,
       'function public_tournament_fixtures'),
  (19, '58 athlete private columns (after 50)',
       not has_column_privilege('anon', 'public.athlete_profiles', 'birth_date', 'SELECT'),
       'anon cannot read athlete_profiles.birth_date'),
  (20, '61 first match rank (after 60)',
       to_regprocedure('public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)') is not null,
       'function record_match_result_first_rank'),
  (21, '62 private athlete avatars',
       coalesce((select not b.public from storage.buckets b where b.id = 'athlete-avatars'), false),
       'athlete-avatars bucket is private'),
  (22, '63 training',
       to_regclass('public.training_checkins') is not null
         and to_regprocedure('public.training_self_start_programs()') is not null,
       'tables training_enrollments + training_checkins')
) as status(step, migration, present, marker)
order by step;
