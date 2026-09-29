-- rollback/60-match-result-request-id-down.sql
-- INCIDENT USE ONLY, with the owner's approval, Staging first. Undoes
-- sql/60-match-result-request-id-v1.sql. Run as postgres. See docs/rollback-plan.md.
--
-- Drops record_match_result_once and its submissions log. Match results themselves are
-- untouched. The app falls back to record_match_result_safely, which brings back the
-- known gap SQL60 closed: a repeated confirm of a draw that moves no rating is recorded
-- twice. Re-applying SQL60 afterwards works unchanged (the log starts empty).

begin;

do $$
begin
  if to_regprocedure('public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)') is null then
    raise exception 'SQL60 is not applied here: nothing to roll back';
  end if;
end;
$$;

drop function public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb);
drop table public.match_result_submissions;

do $$
begin
  if to_regclass('public.match_result_submissions') is not null then
    raise exception 'SQL60 rollback left match_result_submissions behind';
  end if;
  if to_regprocedure('public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb)') is null then
    raise exception 'SQL60 rollback: record_match_result_safely is missing, results cannot be recorded';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
