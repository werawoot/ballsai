-- BallDoenSai.com Team Function Privileges V1
-- Apply after sql/24-team-roster-integrity-v1.sql and sql/25-team-discovery-v1.sql.
-- Never edit those two: they are applied. This file only changes privileges — no
-- function body, table, column, policy, trigger, rating, XP or guardian logic is
-- touched, and no row is written.
--
-- Why this exists: staging showed `has_function_privilege('anon', ..., 'EXECUTE')`
-- returning true for every Team Roster RPC. Supabase's ALTER DEFAULT PRIVILEGES grants
-- EXECUTE on new functions in `public` directly to `anon`, `authenticated` and
-- `service_role`. `REVOKE ... FROM public` — which steps 24 and 25 do — only drops the
-- PUBLIC pseudo-role grant, so the direct grant to `anon` survived it. The revoke has
-- to name `anon`.
--
-- Every one of these functions is SECURITY DEFINER, so it runs as the owner. Each one
-- currently refuses an anonymous caller on its own (`AUTH_REQUIRED`, or an `auth.uid()`
-- predicate that matches nothing), so this is defence in depth rather than an open
-- hole — but an unauthenticated caller should not hold EXECUTE on a definer function
-- at all: it is reachable CPU, and any future edit that forgets the null check would
-- become exploitable the moment it shipped.
--
-- DELIBERATELY NOT LISTED — these are granted to `anon` on purpose. Do not add them:
--   confirm_guardian_verification(text), revoke_guardian_consent(text, text)
--     — a guardian follows an emailed link while logged out (sql/20).
--   is_admin(), is_organizer()
--     — evaluated inside RLS policies for anonymous reads (sql/supabase-rls.sql).

begin;

do $$
declare
  v_signature text;
  v_signatures text[] := array[
    'public.invite_team_member(uuid, text)',
    'public.respond_team_invite(uuid, text)',
    'public.request_team_membership(uuid)',
    'public.approve_team_request(uuid)',
    'public.decline_team_request(uuid)',
    'public.remove_team_member(uuid, text)',
    'public.list_joinable_teams()',
    'public.list_my_team_labels()',
    'public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb)'
  ];
begin
  foreach v_signature in array v_signatures loop
    -- Skipping a missing function keeps this safe to run on an environment where 24
    -- or 25 has not been applied yet, and safe to re-run afterwards: REVOKE of a
    -- grant that is already gone, and GRANT of one already held, are both no-ops.
    if to_regprocedure(v_signature) is null then
      raise notice 'skipping %, function not present', v_signature;
      continue;
    end if;

    execute format('revoke execute on function %s from anon', v_signature);
    -- Re-asserted, not newly granted: the app calls all nine as a signed-in user.
    execute format('grant execute on function %s to authenticated', v_signature);
  end loop;
end
$$;

-- Fail closed: if any function still resolves EXECUTE for anon, or lost it for
-- authenticated, the whole transaction rolls back rather than reporting success.
do $$
declare
  v_signature text;
  v_broken text[] := '{}';
  v_signatures text[] := array[
    'public.invite_team_member(uuid, text)',
    'public.respond_team_invite(uuid, text)',
    'public.request_team_membership(uuid)',
    'public.approve_team_request(uuid)',
    'public.decline_team_request(uuid)',
    'public.remove_team_member(uuid, text)',
    'public.list_joinable_teams()',
    'public.list_my_team_labels()',
    'public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb)'
  ];
begin
  foreach v_signature in array v_signatures loop
    if to_regprocedure(v_signature) is null then continue; end if;

    if has_function_privilege('anon', v_signature, 'EXECUTE') then
      v_broken := array_append(v_broken, v_signature || ' → anon still has EXECUTE');
    end if;
    if not has_function_privilege('authenticated', v_signature, 'EXECUTE') then
      v_broken := array_append(v_broken, v_signature || ' → authenticated lost EXECUTE');
    end if;
  end loop;

  if array_length(v_broken, 1) is not null then
    raise exception 'TEAM_FUNCTION_PRIVILEGES_NOT_APPLIED: %', array_to_string(v_broken, '; ');
  end if;
end
$$;

commit;

-- Post-apply verification. Expect nine rows, anon_execute false, authenticated_execute
-- true. Run it separately after COMMIT; it reads privileges only.
--
--   select p.signature,
--          has_function_privilege('anon', p.signature, 'EXECUTE') as anon_execute,
--          has_function_privilege('authenticated', p.signature, 'EXECUTE') as authenticated_execute
--   from unnest(array[
--     'public.invite_team_member(uuid, text)',
--     'public.respond_team_invite(uuid, text)',
--     'public.request_team_membership(uuid)',
--     'public.approve_team_request(uuid)',
--     'public.decline_team_request(uuid)',
--     'public.remove_team_member(uuid, text)',
--     'public.list_joinable_teams()',
--     'public.list_my_team_labels()',
--     'public.record_match_result_safely(uuid, uuid, uuid, integer, integer, jsonb)'
--   ]) as p(signature)
--   order by p.signature;
