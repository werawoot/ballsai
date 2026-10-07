-- 66-production-sample-data-cleanup-v1.sql
-- Production (hivedzrwrrcnjrlirhtv) only, with owner approval. Data, not schema.
-- Why: a read-only check on 7 Oct 2026 found seed data from 1 Mar 2026 on Production:
-- 10 player_ranks rows with no account (made-up names shown on the public /ranking, against
-- AGENTS.md rule 5) and 3 tournaments still "open" whose dates have passed (11 seed teams).
-- What: deletes those 10 rank rows (their ratings and rating events cascade; 0 match
-- results exist) and closes the 3 tournaments (kept, so nothing else is lost).
-- Guarded: refuses unless it finds exactly 10 and 3, and no match result exists.
-- Code lines are plain ASCII with no comments, so they can be typed by hand.

begin;

do $$
declare
  v_ranks integer;
  v_tournaments integer;
begin
  select count(*) into v_ranks from public.player_ranks
  where player_id is null and created_at::date = date '2026-03-01';
  select count(*) into v_tournaments from public.tournaments
  where status = 'open' and created_at::date = date '2026-03-01' and start_date < date '2026-10-01';
  if v_ranks <> 10 or v_tournaments <> 3 then
    raise exception 'SQL66: expected 10 seed ranks and 3 seed tournaments, found % and %', v_ranks, v_tournaments;
  end if;
  if exists (select 1 from public.match_results) then
    raise exception 'SQL66: match results exist, stop and review by hand';
  end if;

  delete from public.player_ranks
  where player_id is null and created_at::date = date '2026-03-01';

  update public.tournaments set status = 'closed'
  where status = 'open' and created_at::date = date '2026-03-01' and start_date < date '2026-10-01';

  if exists (select 1 from public.player_ranks where player_id is null)
     or exists (select 1 from public.tournaments where status = 'open' and start_date < date '2026-10-01') then
    raise exception 'SQL66: seed data still present after cleanup';
  end if;
end;
$$;

commit;
