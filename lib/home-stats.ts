import { THAI_PROVINCES } from './thai-provinces'
import { CHOICES } from './onboarding'

// The four platform numbers on the home page, and when they are worth showing. A home page
// that opens with "0 tournaments" tells a first visitor nobody uses it, so the block stays
// hidden until every number has passed its floor (owner, 21 Oct 2026). The numbers are
// real counts of public rows, never estimates (AGENTS.md rule 8).

export type HomeStats = { tournaments: number; openTournaments: number; athletes: number; results: number }

export const HOME_STATS_MIN: HomeStats = { tournaments: 10, openTournaments: 1, athletes: 50, results: 20 }

export function homeStatsVisible(stats: HomeStats | null, min: HomeStats = HOME_STATS_MIN): stats is HomeStats {
  if (!stats) return false
  return (Object.keys(min) as Array<keyof HomeStats>).every(key => Number.isFinite(stats[key]) && stats[key] >= min[key])
}

/** The open-tournament count on the football chip shows only from this many up. */
export const SPORT_COUNT_MIN = 3

export function sportOpenCount(stats: HomeStats | null, min = SPORT_COUNT_MIN): number | null {
  const value = stats?.openTournaments
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : null
}

/** Thailand's provinces: the province picker's own list (lib/thai-provinces), so the bar can never claim one more. */
export const PROVINCE_COUNT = THAI_PROVINCES.length

/** The sports the site runs today; /login marks the rest "soon". */
export const OPEN_SPORTS = ['football', 'futsal'] as const

type CountKey = 'athletes' | 'tournaments' | 'results'
type FactKey = 'sports' | 'roles' | 'fee'
export type LoginStat = { key: CountKey | FactKey | 'provinces'; value: number }

/** The stats bar on /login always has this many boxes. */
export const LOGIN_STAT_BOXES = 4

// The stats bar on /login (owner, 23 Oct 2026): four boxes. Each real count shows once it
// passes the home page's floor (a failed count, NaN, never does); the boxes left are filled
// with facts that need no users, each read from the list the site runs on: the sports open
// today, the roles one can sign up as (lib/onboarding), and the sign-up fee, which is none.
// The provinces always close the bar.
export function loginStats(stats: HomeStats | null, min: HomeStats = HOME_STATS_MIN): LoginStat[] {
  const counts = (['athletes', 'tournaments', 'results'] as const).flatMap((key): LoginStat[] => {
    const value = stats?.[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= min[key] ? [{ key, value }] : []
  })
  const facts: LoginStat[] = [{ key: 'sports', value: OPEN_SPORTS.length }, { key: 'roles', value: CHOICES.length }, { key: 'fee', value: 0 }]
  return [...counts, ...facts].slice(0, LOGIN_STAT_BOXES - 1).concat({ key: 'provinces', value: PROVINCE_COUNT })
}
