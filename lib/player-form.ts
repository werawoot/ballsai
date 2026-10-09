// An athlete's form on the public profile: the per-match list, the last-five strip and the
// Power Rating chart, all from rating_events. Only a verified match result writes a rating
// event and voiding the result deletes it (sql/65), so this is performance_verified data
// (AGENTS.md rule 8). A row with a result or rating this code does not know is dropped,
// never drawn as a default.

export type MatchOutcome = 'win' | 'draw' | 'loss'
export type PlayerTab = 'skills' | 'form' | 'matches'

export type RatingEventRow = {
  created_at: string
  result: string | null
  rating_after: number | null
  rating_change: number | null
  goals?: number | null
  assists?: number | null
  mvp?: boolean | null
  clean_sheet?: boolean | null
}

export type FormMatch = { date: string; result: MatchOutcome; ratingAfter: number; change: number; goals: number; assists: number; mvp: boolean; cleanSheet: boolean }
export type RatingChart = { points: [number, number][]; line: string; min: number; max: number; first: number; last: number }
export type FormHistory = { matches: FormMatch[]; lastFive: MatchOutcome[]; chart: RatingChart | null }

// How many events the profile reads; the chart and list show this window, newest first.
export const FORM_EVENT_LIMIT = 20
const OUTCOMES: readonly string[] = ['win', 'draw', 'loss']
const PLAYER_TABS: readonly PlayerTab[] = ['skills', 'form', 'matches']

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
const count = (value: unknown) => (finite(value) && value > 0 ? Math.floor(value) : 0)

export function playerTab(value: string | undefined): PlayerTab {
  return PLAYER_TABS.find(tab => tab === value) ?? 'skills'
}

export function ratingChart(values: number[], width: number, height: number, pad = 0): RatingChart | null {
  if (values.length < 2) return null
  const min = Math.min(...values), max = Math.max(...values)
  const round = (value: number) => Math.round(value * 10) / 10
  const step = (width - pad * 2) / (values.length - 1)
  const points = values.map((value, index): [number, number] => [
    round(pad + index * step),
    round(max === min ? height / 2 : pad + (max - value) / (max - min) * (height - pad * 2)),
  ])
  return { points, line: points.map(([x, y], index) => `${index ? 'L' : 'M'}${x} ${y}`).join(' '), min, max, first: values[0], last: values[values.length - 1] }
}

export function formHistory(rows: RatingEventRow[] | null | undefined, chartBox = { width: 320, height: 120, pad: 8 }): FormHistory {
  const matches = (rows ?? [])
    .filter(row => row && OUTCOMES.includes(row.result ?? '') && finite(row.rating_after) && finite(row.rating_change) && !Number.isNaN(Date.parse(row.created_at)))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map((row): FormMatch => ({
      date: row.created_at,
      result: row.result as MatchOutcome,
      ratingAfter: Math.round(row.rating_after!),
      change: Math.round(row.rating_change!),
      goals: count(row.goals),
      assists: count(row.assists),
      mvp: row.mvp === true,
      cleanSheet: row.clean_sheet === true,
    }))
  const oldestFirst = matches.map(item => item.ratingAfter).reverse()
  return {
    matches,
    lastFive: matches.slice(0, 5).map(item => item.result),
    chart: ratingChart(oldestFirst, chartBox.width, chartBox.height, chartBox.pad),
  }
}
