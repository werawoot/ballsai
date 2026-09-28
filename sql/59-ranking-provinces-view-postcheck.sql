-- Read-only postcheck for SQL59. Check the project ref in the URL first.

select sport, season, count(*) as provinces, sum(athletes) as ranked_athletes
from public.public_ranking_provinces
group by sport, season
order by season desc, sport;
-- Expected: ranked_athletes equals the number of player_ranks rows with a province for
-- that sport and season. Then open /ranking signed out: the province chips list only
-- provinces with ranked athletes, and choosing one filters the table.
