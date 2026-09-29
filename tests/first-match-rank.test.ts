import { describe, expect, it } from 'vitest'
import { FIRST_MATCH_RATING, newPlayerKey, parsePlayerKey, profilePosition, toRecordedPerformance } from '@/lib/first-match-rank'

// T32: in /dashboard/results an athlete without a rank row is picked by a key that names
// the athlete, and is sent to the database by athleteId so sql/61 can create the row.
describe('first-match rank keys', () => {
  const ATHLETE = '3f2b8c1e-6a4d-4c9b-8e7f-1a2b3c4d5e6f'

  it('tells a new athlete from an existing rank row', () => {
    expect(newPlayerKey(ATHLETE)).toBe(`new:${ATHLETE}`)
    expect(parsePlayerKey(`new:${ATHLETE}`)).toEqual({ kind: 'new', athleteId: ATHLETE })
    expect(parsePlayerKey('rank-uuid-1')).toEqual({ kind: 'rank', rankId: 'rank-uuid-1' })
  })

  it('refuses a new key that does not hold a UUID', () => {
    for (const bad of ['new:', 'new:abc', `new:${ATHLETE}x`, '', undefined, null, 42]) expect(parsePlayerKey(bad)).toBeNull()
  })

  it('starts a new athlete at the scale midpoint, with no invented position', () => {
    expect(FIRST_MATCH_RATING).toBe(1000)
    expect(profilePosition('fw')).toBe('FW')
    expect(profilePosition('GK')).toBe('GK')
    for (const bad of [null, undefined, '', 'striker', 'XX']) expect(profilePosition(bad)).toBeNull()
  })

  it('sends a new athlete by athleteId and an existing one by playerRankId', () => {
    const base = { teamId: 't', ratingBefore: 1000, ratingAfter: 1016 }
    expect(toRecordedPerformance({ ...base, playerRankId: `new:${ATHLETE}` })).toEqual({ ...base, athleteId: ATHLETE })
    expect(toRecordedPerformance({ ...base, playerRankId: 'rank-1' })).toEqual({ ...base, playerRankId: 'rank-1' })
  })
})
