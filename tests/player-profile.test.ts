import { describe, expect, it } from 'vitest'
import { seasonSummary } from '@/lib/player-profile'

describe("a public profile's season, from player_ratings only", () => {
  it('reads the verified numbers as they are', () => {
    expect(seasonSummary({ power_rating: 1184.4, matches_played: 6, wins: 3, draws: 2, losses: 1, goals: 5, assists: 3, clean_sheets: 1, mvps: 1 })).toEqual({
      power: 1184, matches: 6, wins: 3, draws: 2, losses: 1, goals: 5, assists: 3, cleanSheets: 1, mvps: 1,
    })
  })

  it('has no season without a rating row or before a first match (rule 8: no default as performance)', () => {
    expect(seasonSummary(null)).toBeNull()
    expect(seasonSummary({ power_rating: 1000, matches_played: 0 })).toBeNull()
  })

  it('treats a missing count as zero only once a match exists, and a missing Power as unknown', () => {
    expect(seasonSummary({ matches_played: 2 })).toEqual({ power: null, matches: 2, wins: 0, draws: 0, losses: 0, goals: 0, assists: 0, cleanSheets: 0, mvps: 0 })
  })
})
