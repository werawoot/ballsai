import { THAI_PROVINCES } from './thai-provinces'

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

export type LoginStat = { key: 'athletes' | 'tournaments' | 'results' | 'provinces'; value: number }

// The stats bar on /login (owner, 23 Oct 2026): each real count shows on its own once it
// passes the home page's floor; a failed count (NaN) never shows. The provinces always do.
export function loginStats(stats: HomeStats | null, min: HomeStats = HOME_STATS_MIN): LoginStat[] {
  const shown = (key: 'athletes' | 'tournaments' | 'results'): LoginStat[] => {
    const value = stats?.[key]
    return typeof value === 'number' && Number.isFinite(value) && value >= min[key] ? [{ key, value }] : []
  }
  return [...shown('athletes'), ...shown('tournaments'), ...shown('results'), { key: 'provinces', value: PROVINCE_COUNT }]
}
