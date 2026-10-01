// What a public athlete profile shows about the season, decided in one place.
// AGENTS.md rule 8: every number here comes from player_ratings, which only verified
// match results write. No rating row, or a row with no match yet, is no season at all:
// the page then says so instead of printing zeros or a starting Power as performance.

export type SeasonSummary = {
  power: number | null
  matches: number
  wins: number
  draws: number
  losses: number
  goals: number
  assists: number
  cleanSheets: number
  mvps: number
}

type RatingRow = Partial<Record<'power_rating' | 'matches_played' | 'wins' | 'draws' | 'losses' | 'goals' | 'assists' | 'clean_sheets' | 'mvps', number | null>>

const count = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)

export function seasonSummary(row: RatingRow | null): SeasonSummary | null {
  const matches = count(row?.matches_played)
  if (!row || matches === 0) return null
  const power = typeof row.power_rating === 'number' && Number.isFinite(row.power_rating) ? Math.round(row.power_rating) : null
  return {
    power,
    matches,
    wins: count(row.wins),
    draws: count(row.draws),
    losses: count(row.losses),
    goals: count(row.goals),
    assists: count(row.assists),
    cleanSheets: count(row.clean_sheets),
    mvps: count(row.mvps),
  }
}
