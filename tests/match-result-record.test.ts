import { describe, expect, it } from 'vitest'
import { parseRequestId, recordMatchResult } from '@/lib/match-result-record'

const args = {
  tournamentId: 'cup', teamAId: 'a', teamBId: 'b', teamAScore: 0, teamBScore: 0,
  performances: [{ playerRankId: 'p', teamId: 'a', ratingBefore: 1000, ratingAfter: 1000 }],
}
const REQUEST = '7f1c7a52-4c3e-4f0f-9d68-5f0b0a1d2e3f'

function fakeClient(answers: Record<string, { data: unknown; error: { code?: string; message: string } | null }>) {
  const calls: [string, Record<string, unknown>][] = []
  const client = { rpc: async (name: string, params: Record<string, unknown>) => { calls.push([name, params]); return answers[name] ?? { data: null, error: null } } }
  return { client: client as never, calls }
}

// A plain draw between equally rated teams leaves every rating where it was, so the
// RATING_CHANGED guard in record_match_result_safely cannot tell a retried or
// double-clicked submission from a new one: the match, its XP and matches_played were
// counted twice. record_match_result_once (sql/60) keys each submission by a request id.
describe('recording a match result once', () => {
  it('sends the submission through record_match_result_once with its request id', async () => {
    const { client, calls } = fakeClient({ record_match_result_once: { data: 'match-1', error: null } })
    expect(await recordMatchResult(client, args, REQUEST)).toEqual({ matchResultId: 'match-1', error: null })
    expect(calls).toEqual([['record_match_result_once', {
      p_request_id: REQUEST, p_tournament_id: 'cup', p_team_a_id: 'a', p_team_b_id: 'b', p_team_a_score: 0, p_team_b_score: 0, p_performances: args.performances,
    }]])
  })

  it.each(['PGRST202', '42883'])('until SQL60 (%s), falls back to record_match_result_safely', async code => {
    const { client, calls } = fakeClient({
      record_match_result_once: { data: null, error: { code, message: 'missing' } },
      record_match_result_safely: { data: 'match-2', error: null },
    })
    expect(await recordMatchResult(client, args, REQUEST)).toEqual({ matchResultId: 'match-2', error: null })
    expect(calls.map(call => call[0])).toEqual(['record_match_result_once', 'record_match_result_safely'])
    expect(calls[1][1]).not.toHaveProperty('p_request_id')
  })

  it('passes a real error back without trying again', async () => {
    const refused = { code: '40001', message: 'RATING_CHANGED' }
    const { client, calls } = fakeClient({ record_match_result_once: { data: null, error: refused } })
    expect(await recordMatchResult(client, args, REQUEST)).toEqual({ matchResultId: null, error: refused })
    expect(calls).toHaveLength(1)
  })

  // T32: a performance may name a new athlete (athleteId) instead of a rank row. Only
  // record_match_result_first_rank (sql/61) can create that row with the match, so there
  // is no fallback: before SQL61 the call says so instead of recording without them.
  it('sends a match with new athletes through record_match_result_first_rank', async () => {
    const withNew = { ...args, performances: [...args.performances, { athleteId: 'ath-1', teamId: 'a', ratingBefore: 1000, ratingAfter: 1016 }] }
    const { client, calls } = fakeClient({ record_match_result_first_rank: { data: 'match-3', error: null } })
    expect(await recordMatchResult(client, withNew, REQUEST, { sport: 'football', season: '2026' })).toEqual({ matchResultId: 'match-3', error: null })
    expect(calls).toEqual([['record_match_result_first_rank', {
      p_request_id: REQUEST, p_tournament_id: 'cup', p_team_a_id: 'a', p_team_b_id: 'b', p_team_a_score: 0, p_team_b_score: 0,
      p_performances: withNew.performances, p_sport: 'football', p_season: '2026',
    }]])
  })

  it.each(['PGRST202', '42883'])('before SQL61 (%s), refuses a match with new athletes instead of dropping them', async code => {
    const withNew = { ...args, performances: [{ athleteId: 'ath-1', teamId: 'a' }] }
    const { client, calls } = fakeClient({ record_match_result_first_rank: { data: null, error: { code, message: 'missing' } } })
    const result = await recordMatchResult(client, withNew, REQUEST, { sport: 'football', season: '2026' })
    expect(result).toEqual({ matchResultId: null, error: { code: 'SQL61_MISSING', message: 'record_match_result_first_rank is not applied' } })
    expect(calls).toHaveLength(1)
  })

  it('accepts only a UUID as a request id', () => {
    expect(parseRequestId(REQUEST)).toBe(REQUEST)
    expect(parseRequestId(REQUEST.toUpperCase())).toBe(REQUEST)
    for (const bad of [undefined, null, '', 'abc', 42, `${REQUEST}x`, "'; drop table x; --"]) expect(parseRequestId(bad)).toBeNull()
  })
})
