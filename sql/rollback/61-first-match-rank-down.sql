-- rollback/61-first-match-rank-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes the function from
-- sql/61-first-match-rank-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- Drops record_match_result_first_rank. Rank rows it already created stay: each one holds
-- a verified match (match_player_performances point at it), so removing it would remove
-- that athlete's recorded results. The app then lists only athletes who already have a
-- rank row, as before SQL61, and new athletes wait on /admin/create again.
--
-- The skill rating columns stay nullable. To restore NOT NULL, use the precheck output
-- saved before applying SQL61, and only after an admin has filled every NULL; that is a
-- separate, hand-written step, not part of this file.

begin;

do $$
begin
  if to_regprocedure('public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text)') is null then
    raise exception 'SQL61 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop function public.record_match_result_first_rank(uuid, uuid, uuid, uuid, integer, integer, jsonb, text, text);

do $$
begin
  if to_regprocedure('public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)') is null then
    raise exception 'SQL61 rollback: record_match_result_once is missing, results cannot be recorded';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
