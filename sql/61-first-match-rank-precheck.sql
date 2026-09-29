-- Read-only precheck for SQL61. Check the project ref in the URL first:
-- Staging vorpnkedpscsqhnrssrl before Production hivedzrwrrcnjrlirhtv.

select to_regprocedure('public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)') is not null as sql60_present,
       exists (
         select 1 from pg_index i join pg_class c on c.oid = i.indexrelid
         where i.indrelid = 'public.player_ranks'::regclass and i.indisunique
           and c.relname = 'player_ranks_player_sport_season_idx'
       ) as unique_rank_index_present,
       to_regprocedure('public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)') is null as name_free;
-- Expected: true, true, true.

-- Which of the columns SQL61 makes nullable are NOT NULL today. Save this output: it is
-- the state a rollback would restore by hand (sql/rollback/61-first-match-rank-down.sql).
select column_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'player_ranks'
  and column_name in ('pac', 'sho', 'pas', 'dri', 'def', 'position')
order by column_name;
-- Expected: six rows. Any value of is_nullable is fine.

-- Athletes on an accepted roster of a confirmed team who have no rank row for the active
-- season: the people this file lets organizers record. Public ones will get a row with
-- their first verified match; private ones stay out until their profile is public.
select a.is_public, count(distinct m.athlete_id) as roster_athletes_without_rank
from public.team_members m
join public.teams t on t.id = m.team_id and t.status = 'confirmed'
left join public.athlete_profiles a on a.user_id = m.athlete_id and a.sport = 'football'
where m.status = 'accepted'
  and not exists (
    select 1 from public.player_ranks r
    where r.player_id = m.athlete_id and r.sport = 'football' and r.season = '2026'
  )
group by a.is_public
order by a.is_public nulls first;
-- Information only (season 2026 and football are the defaults in lib/season.ts; change
-- them here if NEXT_PUBLIC_ACTIVE_SEASON or NEXT_PUBLIC_ACTIVE_SPORT differs).
