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
