import type { StoredDraw, StoredFixture } from './fixture-draw'

// How a stored draw reads on screen: scores turned to home and away, a status for every
// fixture, human names for knockout rounds, who qualifies from a group, and progress.
// Pure, so the public page and the organizer's page show the same thing.

export type Score = { home: number; away: number }
export type FixtureStatus = 'pending' | 'won' | 'drawn' | 'penalties'
export type FixtureView = { score: Score | null; status: FixtureStatus; winnerId: string | null }

// A linked result, turned to this fixture's home and away (results store team A and B).
export function fixtureScore(draw: StoredDraw, fixture: StoredFixture): Score | null {
  const result = fixture.match_result_id ? draw.results[fixture.match_result_id] : undefined
  if (!result || result.status !== 'confirmed') return null
  const homeIsA = result.team_a_id === fixture.home_team_id
  return { home: homeIsA ? result.team_a_score : result.team_b_score, away: homeIsA ? result.team_b_score : result.team_a_score }
}

export function viewFixture(draw: StoredDraw, fixture: StoredFixture): FixtureView {
  const score = fixtureScore(draw, fixture)
  if (!score) return { score, status: 'pending', winnerId: null }
  if (score.home !== score.away) return { score, status: 'won', winnerId: score.home > score.away ? fixture.home_team_id : fixture.away_team_id }
  // A drawn knockout match is decided on penalties by the organizer (sql/56).
  if (fixture.stage === 'knockout') return { score, status: 'penalties', winnerId: fixture.winner_team_id ?? null }
  return { score, status: 'drawn', winnerId: null }
}

export type RoundName = { key: 'final' | 'semi' | 'quarter' | 'roundOf'; teams: number }

// Knockout round r of n is played by 2^(n - r + 1) teams: the last is the final.
export function knockoutRoundName(round: number, totalRounds: number): RoundName {
  const teams = 2 ** Math.max(1, totalRounds - round + 1)
  if (teams === 2) return { key: 'final', teams }
  if (teams === 4) return { key: 'semi', teams }
  if (teams === 8) return { key: 'quarter', teams }
  return { key: 'roundOf', teams }
}

export const knockoutRounds = (draw: StoredDraw) => Math.max(0, ...draw.fixtures.filter(fixture => fixture.stage === 'knockout').map(fixture => fixture.round))

// Match number inside its round, from keys like KO-R2-M1 or GA-R1-M3.
export const matchNumber = (fixture: StoredFixture) => Number(fixture.fixture_key.match(/M(\d+)$/)?.[1] ?? 0)

// How many from each group reach the knockout: the deepest "group:A:n" a knockout slot
// waits for. A league or a pure knockout has none.
export function qualifyingPlaces(draw: StoredDraw): Record<string, number> {
  const places: Record<string, number> = {}
  for (const fixture of draw.fixtures) {
    if (fixture.stage !== 'knockout') continue
    for (const source of [fixture.home_source, fixture.away_source]) {
      const [kind, group, position] = (source ?? '').split(':')
      if (kind === 'group' && group && Number(position) > 0) places[group] = Math.max(places[group] ?? 0, Number(position))
    }
  }
  return places
}

export function drawProgress(draw: StoredDraw, fixtures = draw.fixtures) {
  return { played: fixtures.filter(fixture => fixtureScore(draw, fixture) !== null).length, total: fixtures.length }
}

export const hasKnockout = (draw: StoredDraw) => draw.fixtures.some(fixture => fixture.stage === 'knockout')
export const groupLabels = (draw: StoredDraw) => [...new Set(draw.fixtures.filter(fixture => fixture.stage === 'group' && fixture.group_label).map(fixture => fixture.group_label!))].sort()

// A team's badge until teams upload a crest: its first letter (two initials for a Latin
// name of several words), on one of eight colours chosen from the name, the same on
// every page.
const BADGE_COLOURS = ['#CC0001', '#2869d8', '#149a5a', '#8a5a00', '#6b21a8', '#0f766e', '#be185d', '#334155']
const BASE_LETTER = /[ก-ฮA-Za-z0-9]/
export function teamBadge(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = (word: string) => [...word].find(char => BASE_LETTER.test(char)) ?? ''
  const latin = words.length > 1 && words.slice(0, 2).every(word => /^[A-Za-z0-9]/.test(word))
  const initials = (latin ? first(words[0]) + first(words[1]) : first(words[0] ?? '')).toUpperCase() || '?'
  let hash = 0
  for (const char of name) hash = (hash * 31 + char.codePointAt(0)!) >>> 0
  return { initials, colour: BADGE_COLOURS[hash % BADGE_COLOURS.length] }
}
