import { describe, expect, it } from 'vitest'
import { HOME_STATS_MIN, homeStatsVisible, SPORT_COUNT_MIN, sportOpenCount } from '@/lib/home-stats'

describe('the home page platform numbers', () => {
  it('stay hidden while any number is below its floor, so a new site never opens with zeros', () => {
    expect(homeStatsVisible({ tournaments: 0, openTournaments: 0, athletes: 0, results: 0 })).toBe(false)
    expect(homeStatsVisible({ ...HOME_STATS_MIN, athletes: HOME_STATS_MIN.athletes - 1 })).toBe(false)
    expect(homeStatsVisible(null)).toBe(false)
  })

  it('show once every number has reached its floor', () => {
    expect(homeStatsVisible(HOME_STATS_MIN)).toBe(true)
    expect(homeStatsVisible({ tournaments: 120, openTournaments: 8, athletes: 4200, results: 900 })).toBe(true)
  })

  it('never shows a count that failed to load', () => {
    expect(homeStatsVisible({ ...HOME_STATS_MIN, results: Number.NaN })).toBe(false)
  })
})

describe('the open count on the football chip', () => {
  it('shows a real count once there are a few, and nothing before or when it failed', () => {
    const base = { tournaments: 0, athletes: 0, results: 0 }
    expect(sportOpenCount({ ...base, openTournaments: SPORT_COUNT_MIN })).toBe(SPORT_COUNT_MIN)
    expect(sportOpenCount({ ...base, openTournaments: 12 })).toBe(12)
    expect(sportOpenCount({ ...base, openTournaments: SPORT_COUNT_MIN - 1 })).toBeNull()
    expect(sportOpenCount({ ...base, openTournaments: Number.NaN })).toBeNull()
    expect(sportOpenCount(null)).toBeNull()
  })
})

// /login's stats bar (owner, 23 Oct 2026): real counts only, each shown on its own once it
// passes the same floor the home page uses; the 77 provinces are a fact and always show.
import { loginStats, PROVINCE_COUNT } from '@/lib/home-stats'
describe('the /login stats bar', () => {
  it('shows only the 77 provinces while the counts are small', () => {
    expect(loginStats({ tournaments: 2, openTournaments: 1, athletes: 7, results: 3 })).toEqual([{ key: 'provinces', value: PROVINCE_COUNT }])
    expect(PROVINCE_COUNT).toBe(77)
  })
  it('adds each count once it passes its own floor, never a failed one', () => {
    expect(loginStats({ tournaments: 12, openTournaments: 0, athletes: 60, results: Number.NaN })).toEqual([
      { key: 'athletes', value: 60 }, { key: 'tournaments', value: 12 }, { key: 'provinces', value: 77 },
    ])
    expect(loginStats(null)).toEqual([{ key: 'provinces', value: 77 }])
  })
})
