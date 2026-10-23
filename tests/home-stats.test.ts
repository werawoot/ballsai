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

// /login's stats bar (owner, 23 Oct 2026): always four boxes. Real counts come first, each
// once past the home page's floor; the rest are facts that need no users: the sports open
// today, the roles one can sign up as, the sign-up fee. The 77 provinces always close the bar.
import { loginStats, OPEN_SPORTS, PROVINCE_COUNT } from '@/lib/home-stats'
import { CHOICES } from '@/lib/onboarding'
describe('the /login stats bar', () => {
  it('fills four boxes with facts while the counts are small, the provinces last', () => {
    expect(loginStats({ tournaments: 2, openTournaments: 1, athletes: 7, results: 3 })).toEqual([
      { key: 'sports', value: 2 }, { key: 'roles', value: 6 }, { key: 'fee', value: 0 }, { key: 'provinces', value: 77 },
    ])
    expect(loginStats(null).map(stat => stat.key)).toEqual(['sports', 'roles', 'fee', 'provinces'])
  })
  it('takes its facts from the lists the site runs on, not from typed-in numbers', () => {
    expect(PROVINCE_COUNT).toBe(77)
    expect(OPEN_SPORTS).toEqual(['football', 'futsal'])
    expect(loginStats(null).find(stat => stat.key === 'roles')?.value).toBe(CHOICES.length)
  })
  it('lets a real count take a fact\'s place once it passes its floor, never a failed one', () => {
    expect(loginStats({ tournaments: 12, openTournaments: 0, athletes: 60, results: Number.NaN })).toEqual([
      { key: 'athletes', value: 60 }, { key: 'tournaments', value: 12 }, { key: 'sports', value: 2 }, { key: 'provinces', value: 77 },
    ])
    expect(loginStats({ tournaments: 12, openTournaments: 0, athletes: 60, results: 25 }).map(stat => stat.key)).toEqual(['athletes', 'tournaments', 'results', 'provinces'])
  })
})
