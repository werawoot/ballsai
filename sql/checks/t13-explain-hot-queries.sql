-- T13: do the hot queries have an index? Read-only. Run on Staging (vorpnkedpscsqhnrssrl)
-- first; Production only after its SQL51-53/59 are applied.
--
-- EXPLAIN without ANALYZE plans a query and never runs it. Staging's tables are small, so
-- Postgres would rightly read them whole; "set local enable_seqscan = off" makes it pick
-- an index whenever one fits, for this one run only (the setting ends with the run).
-- So a "Seq Scan" still in a plan means NO index can serve that query: that is the
-- finding. Run each block on its own (select from "-- Q1" to the next "-- Q") and copy
-- the whole plan.
--
-- The queries copy the shapes the app sends (lib/public-*.ts, lib/notification-count.ts,
-- lib/organizer-dashboard.ts, lib/training/data.ts, app/players/[id]).

-- Q0 table sizes (for the report)
select relname, n_live_tup from pg_stat_user_tables
where relname in ('tournaments', 'venue_profiles', 'athlete_profiles', 'player_ranks', 'player_ratings',
                  'notifications', 'training_enrollments', 'training_checkins', 'match_results', 'teams')
order by relname;

-- Q1 /tournaments upcoming (expect tournaments_start_date_page_idx)
set local enable_seqscan = off;
explain select * from public.tournaments where end_date >= '2026-10-04'
order by start_date, id limit 13;

-- Q2 /tournaments past (expect tournaments_start_date_page_idx, backward)
set local enable_seqscan = off;
explain select * from public.tournaments where end_date < '2026-10-04'
order by start_date desc, id desc limit 13;

-- Q3 /venues (expect venue_profiles_published_page_idx)
set local enable_seqscan = off;
explain select id, name, province from public.venue_profiles where is_published
order by created_at desc, id limit 13;

-- Q4 /athletes (expect athlete_profiles_directory_page_idx)
set local enable_seqscan = off;
explain select * from public.public_athlete_directory where sport = 'football'
order by created_at desc, user_id limit 25;

-- Q5 /ranking page (expect an index on player_ranks (sport, season, pts))
set local enable_seqscan = off;
explain select * from public.player_ranks where sport = 'football' and season = '2026'
order by pts desc, id limit 51;

-- Q6 "my position" count (expect an index scan, not a read of the table)
set local enable_seqscan = off;
explain select count(*) from public.player_ranks where sport = 'football' and season = '2026' and pts > 1000;

-- Q7 /players/[id] by athlete (expect an index on player_ranks (player_id, ...))
set local enable_seqscan = off;
explain select * from public.player_ranks
where player_id = '00000000-0000-0000-0000-000000000000' and sport = 'football' and season = '2026';

-- Q8 /players/[id] season stats (expect an index on player_ratings (player_rank_id, ...))
set local enable_seqscan = off;
explain select power_rating, matches_played from public.player_ratings
where player_rank_id = '00000000-0000-0000-0000-000000000000' and sport = 'football' and season = '2026';

-- Q9 /ranking "emerging" view
set local enable_seqscan = off;
explain select * from public.public_athlete_rankings where sport = 'football' and season = '2026' and under_18
order by rank_change desc, pts desc, id limit 10;

-- Q10 /ranking province filter (view from SQL59)
set local enable_seqscan = off;
explain select province from public.public_ranking_provinces where sport = 'football' and season = '2026'
order by province;

-- Q11 unread notifications badge, every signed-in page (expect an index on notifications (user_id, ...))
set local enable_seqscan = off;
explain select count(*) from public.notifications
where user_id = '00000000-0000-0000-0000-000000000000' and read_at is null;

-- Q12 /dashboard organizer's tournaments (expect an index on tournaments (organizer_id, ...))
set local enable_seqscan = off;
explain select * from public.tournaments where organizer_id = '00000000-0000-0000-0000-000000000000'
order by created_at desc, id limit 11;

-- Q13 /training my programmes (expect training_enrollments_athlete_idx)
set local enable_seqscan = off;
explain select id, program_id from public.training_enrollments
where athlete_id = '00000000-0000-0000-0000-000000000000' and status = 'active'
order by created_at desc;
