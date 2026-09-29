import type { SupabaseClient } from '@supabase/supabase-js'

// Records a confirmed match result exactly once per submission. The form mints a request
// id for each preview and sends it with the confirm; record_match_result_once (sql/60)
// returns the first result for a repeated id instead of counting the match again. Before
// SQL60 the call falls back to record_match_result_safely, whose RATING_CHANGED guard
// catches most repeats but not a draw that leaves every rating unchanged.

type Failure = { code?: string; message: string } | null
export type RecordArgs = {
  tournamentId: string
  teamAId: string
  teamBId: string
  teamAScore: number
  teamBScore: number
  performances: unknown[]
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function parseRequestId(value: unknown): string | null {
  return typeof value === 'string' && UUID.test(value) ? value.toLowerCase() : null
}

// PostgREST answers PGRST202 for a function it does not know; Postgres itself 42883.
const isMissingFunction = (error: Failure) => error?.code === 'PGRST202' || error?.code === '42883'

const hasNewAthlete = (performances: unknown[]) =>
  performances.some(item => Boolean(item && typeof item === 'object' && 'athleteId' in item))

export async function recordMatchResult(
  client: SupabaseClient,
  args: RecordArgs,
  requestId: string,
  season?: { sport: string; season: string },
): Promise<{ matchResultId: string | null; error: Failure }> {
  const params = {
    p_tournament_id: args.tournamentId,
    p_team_a_id: args.teamAId,
    p_team_b_id: args.teamBId,
    p_team_a_score: args.teamAScore,
    p_team_b_score: args.teamBScore,
    p_performances: args.performances,
  }
  // T32: an athlete with no rank row yet gets one with this match (sql/61). Nothing else
  // can create it, so before SQL61 such a match is refused, never recorded without them.
  if (season && hasNewAthlete(args.performances)) {
    const first = await client.rpc('record_match_result_first_rank', { p_request_id: requestId, ...params, p_sport: season.sport, p_season: season.season })
    if (isMissingFunction(first.error)) return { matchResultId: null, error: { code: 'SQL61_MISSING', message: 'record_match_result_first_rank is not applied' } }
    return { matchResultId: (first.data as string | null) ?? null, error: first.error as Failure }
  }
  const once = await client.rpc('record_match_result_once', { p_request_id: requestId, ...params })
  if (!isMissingFunction(once.error)) return { matchResultId: (once.data as string | null) ?? null, error: once.error as Failure }
  // Before SQL60. Delete once it is applied on Production.
  const legacy = await client.rpc('record_match_result_safely', params)
  return { matchResultId: (legacy.data as string | null) ?? null, error: legacy.error as Failure }
}
