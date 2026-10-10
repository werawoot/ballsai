import { describe, expect, it } from 'vitest'
import { MATCH_LENGTHS, cleanMinuteEntries, entryMinutes, minutesTotals } from '@/lib/match-minutes'

// Minutes played (sql/74): the coach's record of who started and who came on or off.
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'

describe('minutes from a starter or a substitute', () => {
  it('counts from the start or the minute they came on, to the end or the minute they went off', () => {
    expect(entryMinutes({ athleteId: A, started: true, on: null, off: null }, 50)).toBe(50)
    expect(entryMinutes({ athleteId: A, started: true, on: null, off: 35 }, 50)).toBe(35)
    expect(entryMinutes({ athleteId: A, started: false, on: 10, off: null }, 50)).toBe(40)
    expect(entryMinutes({ athleteId: A, started: false, on: 10, off: 30 }, 50)).toBe(20)
  })
})

describe('a sheet the database will accept', () => {
  it('keeps valid entries as they are', () => {
    expect(cleanMinuteEntries([{ athleteId: A, started: true, off: 35 }, { athleteId: B, started: false, on: 35 }], 50))
      .toEqual([{ athleteId: A, started: true, on: null, off: 35 }, { athleteId: B, started: false, on: 35, off: null }])
  })

  it('refuses what the database refuses', () => {
    for (const entries of [
      [{ athleteId: A, started: true, on: 5 }],
      [{ athleteId: A, started: false }],
      [{ athleteId: A, started: false, on: 30, off: 20 }],
      [{ athleteId: A, started: true, off: 51 }],
      [{ athleteId: A, started: true, off: 20.5 }],
      [{ athleteId: A, started: false, on: 50 }],
      [{ athleteId: A, started: true }, { athleteId: A, started: true }],
      [{ athleteId: 'x', started: true }],
      'not a list',
    ]) expect(cleanMinuteEntries(entries, 50)).toBeNull()
    expect(cleanMinuteEntries([], 10)).toBeNull()
    expect(MATCH_LENGTHS).toEqual([40, 50, 60, 70, 80, 90])
  })
})

describe('a season of minutes', () => {
  it('adds up per athlete: matches, starts and minutes', () => {
    expect(minutesTotals([
      { athlete_id: A, started: true, minutes: 50 },
      { athlete_id: A, started: false, minutes: 15 },
      { athlete_id: B, started: false, minutes: 10 },
    ])).toEqual({ [A]: { matches: 2, starts: 1, minutes: 65 }, [B]: { matches: 1, starts: 0, minutes: 10 } })
  })
})
