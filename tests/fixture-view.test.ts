import { describe, expect, it } from 'vitest'
import type { StoredDraw, StoredFixture } from '@/lib/fixture-draw'
import { drawProgress, knockoutRoundName, qualifyingPlaces, teamBadge, viewFixture } from '@/lib/fixture-view'

const fixture = (key: string, extra: Partial<StoredFixture> = {}): StoredFixture => ({
  fixture_key: key, stage: 'group', round: 1, group_label: 'A', home_team_id: 'a', away_team_id: 'b',
  home_source: null, away_source: null, match_result_id: null, winner_team_id: null, ...extra,
})
const draw = (fixtures: StoredFixture[], results: StoredDraw['results'] = {}): StoredDraw => ({
  fixtures, results, teamNames: { a: 'Lions', b: 'Tigers' }, teamOrder: ['a', 'b'], migrationMissing: false, failed: false,
})

describe('how a draw reads', () => {
  it('names knockout rounds by the teams left, so the last is always the final', () => {
    expect([1, 2, 3, 4].map(round => knockoutRoundName(round, 4).key)).toEqual(['roundOf', 'quarter', 'semi', 'final'])
    expect(knockoutRoundName(1, 4).teams).toBe(16)
    expect(knockoutRoundName(1, 1).key).toBe('final')
  })

  it('turns a result stored as team A and B to the fixture\'s home and away, and says who won', () => {
    const results = { r: { id: 'r', team_a_id: 'b', team_b_id: 'a', team_a_score: 3, team_b_score: 1, status: 'confirmed' } }
    expect(viewFixture(draw([], results), fixture('GA-R1-M1', { match_result_id: 'r' }))).toEqual({ score: { home: 1, away: 3 }, status: 'won', winnerId: 'b' })
  })

  it('never counts a result the organizer has not confirmed', () => {
    const results = { r: { id: 'r', team_a_id: 'a', team_b_id: 'b', team_a_score: 2, team_b_score: 0, status: 'pending' } }
    const item = fixture('GA-R1-M1', { match_result_id: 'r' })
    expect(viewFixture(draw([item], results), item).status).toBe('pending')
    expect(drawProgress(draw([item], results))).toEqual({ played: 0, total: 1 })
  })

  it('keeps a group draw a draw, and a knockout draw waiting for penalties until a winner is named', () => {
    const results = { r: { id: 'r', team_a_id: 'a', team_b_id: 'b', team_a_score: 1, team_b_score: 1, status: 'confirmed' } }
    expect(viewFixture(draw([], results), fixture('GA-R1-M1', { match_result_id: 'r' })).status).toBe('drawn')
    expect(viewFixture(draw([], results), fixture('KO-R1-M1', { stage: 'knockout', match_result_id: 'r' }))).toMatchObject({ status: 'penalties', winnerId: null })
    expect(viewFixture(draw([], results), fixture('KO-R1-M1', { stage: 'knockout', match_result_id: 'r', winner_team_id: 'b' }))).toMatchObject({ status: 'penalties', winnerId: 'b' })
  })

  it('finds how many go through from each group from the knockout slots, not from a setting', () => {
    const knockout = [
      fixture('KO-R1-M1', { stage: 'knockout', home_team_id: null, away_team_id: null, home_source: 'group:A:1', away_source: 'group:B:2' }),
      fixture('KO-R1-M2', { stage: 'knockout', home_team_id: null, away_team_id: null, home_source: 'group:B:1', away_source: 'group:A:2' }),
      fixture('KO-R2-M1', { stage: 'knockout', round: 2, home_team_id: null, away_team_id: null, home_source: 'winner:KO-R1-M1', away_source: 'winner:KO-R1-M2' }),
    ]
    expect(qualifyingPlaces(draw(knockout))).toEqual({ A: 2, B: 2 })
    expect(qualifyingPlaces(draw([fixture('L-R1-M1', { stage: 'league', group_label: null })]))).toEqual({})
  })

  it('gives every team the same badge on every page, without Thai vowel marks', () => {
    expect(teamBadge('ช้างเผือก FC').initials).toBe('ช')
    expect(teamBadge('เชียงใหม่ ยูไนเต็ด').initials).toBe('ช')
    expect(teamBadge('City Lions').initials).toBe('CL')
    expect(teamBadge('Lions').initials).toBe('L')
    expect(teamBadge('ช้างเผือก FC')).toEqual(teamBadge('ช้างเผือก FC'))
  })
})
