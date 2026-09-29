-- 60-match-result-request-id-v1.sql
-- Pending review. Staging (vorpnkedpscsqhnrssrl) first; Production (hivedzrwrrcnjrlirhtv)
-- only with separate owner approval. Depends on production-hardening
-- (record_match_result_safely). Apply BEFORE SQL50, like every file that creates a
-- definer function. Run as postgres.
--
-- Why (found writing T14): record_match_result_safely has no idea whether it has seen a
-- submission before. Its RATING_CHANGED guard stops most repeats, because the first call
-- moves every player's rating. A plain draw between equally rated teams moves nothing
-- (lib/rating.ts: 1000 vs 1000, draw, no stats: change 0), so a retried or double-clicked
-- confirm recorded the match twice: two match_results rows, XP and matches_played twice,
-- and with SQL56 the copy would be linked to the next fixture between the same teams.
--
-- What:
--   * match_result_submissions: one row per request id, who sent it, and the result it
--     produced. RLS on, no policy, no grant: only the function below touches it.
--   * record_match_result_once(request id, the same arguments): inserts the request id
--     first. A repeat, sequential or concurrent, waits on that key and then returns the
--     first result instead of recording again. The recording itself is unchanged: it
--     calls record_match_result_safely in the same transaction, so a failed recording
--     leaves no request row behind and can simply be retried.
--   * A request id belongs to the account that sent it; another account reusing it is
--     refused with REQUEST_ID_TAKEN rather than handed someone else's result.
--   * authenticated may execute it; anon and PUBLIC may not.
--
-- The app (lib/match-result-record.ts) calls it with an id minted per preview, and falls
-- back to record_match_result_safely until this file is applied.

begin;

do $$
begin
  if to_regprocedure('public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb)') is null then
    raise exception 'SQL60 needs record_match_result_safely (production-hardening) first';
  end if;
end;
$$;

create table public.match_result_submissions (
  request_id uuid primary key,
  requested_by uuid not null references auth.users(id) on delete cascade,
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  match_result_id uuid references public.match_results(id) on delete set null,
  created_at timestamptz not null default now()
);
create index match_result_submissions_match_idx on public.match_result_submissions (match_result_id);

alter table public.match_result_submissions enable row level security;
revoke all on public.match_result_submissions from public, anon, authenticated;
comment on table public.match_result_submissions is
  'One row per match result submission (request id), so a repeat returns the first result. Written only by record_match_result_once. sql/60.';

create function public.record_match_result_once(
  p_request_id uuid,
  p_tournament_id uuid,
  p_team_a_id uuid,
  p_team_b_id uuid,
  p_team_a_score integer,
  p_team_b_score integer,
  p_performances jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_by uuid;
  v_match uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_request_id is null then
    raise exception 'REQUEST_ID_REQUIRED' using errcode = '22023';
  end if;

  -- A concurrent insert of the same id waits here until the first transaction ends.
  insert into public.match_result_submissions (request_id, requested_by, tournament_id)
  values (p_request_id, v_user, p_tournament_id)
  on conflict (request_id) do nothing;

  if not found then
    select s.requested_by, s.match_result_id into v_by, v_match
    from public.match_result_submissions s
    where s.request_id = p_request_id;
    if v_by is distinct from v_user then
      raise exception 'REQUEST_ID_TAKEN' using errcode = '42501';
    end if;
    return v_match;
  end if;

  v_match := public.record_match_result_safely(
    p_tournament_id, p_team_a_id, p_team_b_id, p_team_a_score, p_team_b_score, p_performances
  );
  update public.match_result_submissions set match_result_id = v_match where request_id = p_request_id;
  return v_match;
end;
$$;

revoke all on function public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb) from public, anon, authenticated;
grant execute on function public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb) to authenticated, service_role;

do $$
begin
  if has_function_privilege('anon', 'public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.record_match_result_once(uuid, uuid, uuid, uuid, integer, integer, jsonb)', 'EXECUTE') then
    raise exception 'SQL60 function privileges are wrong';
  end if;
  if has_table_privilege('anon', 'public.match_result_submissions', 'SELECT')
     or has_table_privilege('authenticated', 'public.match_result_submissions', 'SELECT')
     or has_table_privilege('authenticated', 'public.match_result_submissions', 'INSERT') then
    raise exception 'SQL60 left match_result_submissions open to clients';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.match_result_submissions'::regclass) then
    raise exception 'SQL60 match_result_submissions has RLS off';
  end if;
end;
$$;

notify pgrst, 'reload schema';

commit;
