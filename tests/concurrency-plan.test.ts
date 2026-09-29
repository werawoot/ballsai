import { describe, expect, it } from 'vitest'
// @ts-expect-error -- plain .mjs module shared with the Node script
import { assertMayRun, judgeAtMostOne, judgeOneWinner, judgeSameAnswer, tally, unchangedDrawPayload } from '../scripts/concurrency-plan.mjs'

const win = (body: unknown = 'id-1') => ({ status: 200, body })
const refuse = (message: string) => ({ status: 400, body: { message } })

// T14 fires the same write many times at once against Staging. These rules decide what
// counts as a pass, and where the script may run at all.
describe('where the concurrency checks may run', () => {
  it('refuses Production, any other project, and a run nobody allowed to write', () => {
    expect(assertMayRun('https://hivedzrwrrcnjrlirhtv.supabase.co', 'true')).toMatch(/Production/)
    expect(assertMayRun('https://someoneelse.supabase.co', 'true')).toMatch(/outside Staging/)
    expect(assertMayRun('https://vorpnkedpscsqhnrssrl.supabase.co', undefined)).toMatch(/ALLOW_CONCURRENCY_WRITES/)
    expect(assertMayRun(undefined, 'true')).toMatch(/not set/)
    expect(assertMayRun('https://vorpnkedpscsqhnrssrl.supabase.co', 'true')).toBeNull()
  })
})

describe('judging a burst of simultaneous answers', () => {
  it('passes one booking winner whose rivals were refused for the slot', () => {
    const answers = [win(), refuse('SLOT_ALREADY_REQUESTED'), refuse('SLOT_UNAVAILABLE'), refuse('SLOT_ALREADY_REQUESTED')]
    expect(judgeOneWinner(answers, ['SLOT_ALREADY_REQUESTED', 'SLOT_UNAVAILABLE']).passed).toBe(true)
    expect(tally(answers)).toEqual({ successes: 1, errors: { SLOT_ALREADY_REQUESTED: 2, SLOT_UNAVAILABLE: 1 } })
  })

  it('fails a double booking, a lost booking, and an unexpected error', () => {
    expect(judgeOneWinner([win(), win(), refuse('SLOT_ALREADY_REQUESTED')], ['SLOT_ALREADY_REQUESTED']).passed).toBe(false)
    expect(judgeOneWinner([refuse('SLOT_ALREADY_REQUESTED'), refuse('SLOT_ALREADY_REQUESTED')], ['SLOT_ALREADY_REQUESTED']).passed).toBe(false)
    expect(judgeOneWinner([win(), { status: 500, body: 'boom' }], ['SLOT_ALREADY_REQUESTED']).passed).toBe(false)
  })

  it('allows no new team when the coach already had one, never two', () => {
    const expected = ['ALREADY_HAS_TEAM_FOR_TOURNAMENT']
    expect(judgeAtMostOne([refuse('ALREADY_HAS_TEAM_FOR_TOURNAMENT'), refuse('ALREADY_HAS_TEAM_FOR_TOURNAMENT')], expected).passed).toBe(true)
    expect(judgeAtMostOne([win(), refuse('ALREADY_HAS_TEAM_FOR_TOURNAMENT')], expected).passed).toBe(true)
    expect(judgeAtMostOne([win('t1'), win('t2')], expected).passed).toBe(false)
  })

  it('passes a repeated result submission only when every answer is the same result', () => {
    expect(judgeSameAnswer([win('m1'), win('m1'), win('m1')]).passed).toBe(true)
    expect(judgeSameAnswer([win('m1'), win('m2')]).passed).toBe(false)
    expect(judgeSameAnswer([win('m1'), refuse('RATING_CHANGED')]).passed).toBe(false)
  })

  it('builds the draw that leaves the rating where it was', () => {
    const [item] = unchangedDrawPayload({ playerRankId: 'p', teamId: 'a', rating: 1000 })
    expect(item).toMatchObject({ result: 'draw', ratingBefore: 1000, ratingAfter: 1000, ratingChange: 0, opponentRating: 1000 })
  })
})
