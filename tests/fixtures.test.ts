import { describe, expect, it } from 'vitest'
import {
  bracketOrder, groupStageFixtures, knockoutFixtures, leagueFixtures, standings,
  type Fixture, type Slot,
} from '@/lib/fixtures'

const teams = (count: number) => Array.from({ length: count }, (_, index) => `T${index + 1}`)
const team = (id: string): Slot => ({ kind: 'team', teamId: id })
const label = (slot: Slot) => slot.kind === 'team' ? slot.teamId : slot.kind === 'winner' ? `W(${slot.fixtureKey})` : `${slot.group}${slot.position}`
const pairs = (fixtures: Fixture[], round: number) => fixtures.filter(item => item.round === round).map(item => `${label(item.home)}-${label(item.away)}`)
const teamsIn = (fixture: Fixture) => [fixture.home, fixture.away].flatMap(slot => slot.kind === 'team' ? [slot.teamId] : [])

describe('knockout', () => {
  it('seeds a full bracket so the top seeds can only meet late', () => {
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6])
    const fixtures = knockoutFixtures(teams(8).map(team))
    expect(pairs(fixtures, 1)).toEqual(['T1-T8', 'T4-T5', 'T2-T7', 'T3-T6'])
    expect(pairs(fixtures, 2)).toEqual(['W(KO-R1-M1)-W(KO-R1-M2)', 'W(KO-R1-M3)-W(KO-R1-M4)'])
    expect(pairs(fixtures, 3)).toEqual(['W(KO-R2-M1)-W(KO-R2-M2)'])
    expect(fixtures).toHaveLength(7)
  })

  it('gives byes to the top seeds when the field is not a power of two, and schedules no bye match', () => {
    const fixtures = knockoutFixtures(teams(6).map(team))
    // 6 teams in an 8-bracket: seeds 1 and 2 go straight to round 2.
    expect(pairs(fixtures, 1)).toEqual(['T4-T5', 'T3-T6'])
    expect(pairs(fixtures, 2)).toEqual(['T1-W(KO-R1-M1)', 'T2-W(KO-R1-M2)'])
    expect(pairs(fixtures, 3)).toEqual(['W(KO-R2-M1)-W(KO-R2-M2)'])
    // n teams, single elimination: always n - 1 matches.
    for (const count of [2, 3, 5, 6, 7, 9, 12, 16, 17, 31, 64]) expect(knockoutFixtures(teams(count).map(team))).toHaveLength(count - 1)
  })

  it('refuses a field too small or with a team twice', () => {
    expect(() => knockoutFixtures([team('T1')])).toThrow('AT_LEAST_TWO_TEAMS')
    expect(() => knockoutFixtures([team('T1'), team('T1')])).toThrow('DUPLICATE_TEAM')
  })
})

describe('league (everyone plays everyone once)', () => {
  it.each([2, 3, 4, 5, 8, 11, 20])('schedules every pair exactly once for %i teams, nobody twice in a round', count => {
    const fixtures = leagueFixtures(teams(count))
    expect(fixtures).toHaveLength((count * (count - 1)) / 2)
    const seen = new Set(fixtures.map(item => teamsIn(item).sort().join('|')))
    expect(seen.size).toBe(fixtures.length)
    const rounds = new Set(fixtures.map(item => item.round))
    expect(rounds.size).toBe(count % 2 === 0 ? count - 1 : count)
    for (const round of rounds) {
      const playing = fixtures.filter(item => item.round === round).flatMap(teamsIn)
      expect(new Set(playing).size).toBe(playing.length)
    }
  })

  it.each([3, 5, 7, 8, 9, 11, 12, 20, 21])('balances home and away games within one of each other (%i teams)', count => {
    const fixtures = leagueFixtures(teams(count))
    for (const id of teams(count)) {
      const home = fixtures.filter(item => label(item.home) === id).length
      const away = fixtures.filter(item => label(item.away) === id).length
      expect(Math.abs(home - away)).toBeLessThanOrEqual(1)
    }
  })
})

describe('groups, then knockout', () => {
  it('snakes teams into groups, plays each group as a league, and crosses groups in the knockout', () => {
    const { groups, fixtures } = groupStageFixtures(teams(8), { groupCount: 2, advancePerGroup: 2 })
    expect(groups).toEqual({ A: ['T1', 'T4', 'T5', 'T8'], B: ['T2', 'T3', 'T6', 'T7'] })
    const groupGames = fixtures.filter(item => item.stage === 'group')
    expect(groupGames).toHaveLength(12)
    for (const game of groupGames) expect(groups[game.group!]).toEqual(expect.arrayContaining(teamsIn(game)))
    const knockout = fixtures.filter(item => item.stage === 'knockout')
    // A group winner never meets its own runner-up in the first knockout round.
    expect(pairs(knockout, 1)).toEqual(['A1-B2', 'B1-A2'])
    expect(pairs(knockout, 2)).toEqual(['W(KO-R1-M1)-W(KO-R1-M2)'])
  })

  it('crosses an odd number of groups without a same-group pairing', () => {
    const { fixtures } = groupStageFixtures(teams(12), { groupCount: 3, advancePerGroup: 2 })
    const first = fixtures.filter(item => item.stage === 'knockout' && item.round === 1)
    for (const game of first) {
      const groupsMet = [game.home, game.away].flatMap(slot => slot.kind === 'group' ? [slot.group] : [])
      expect(new Set(groupsMet).size).toBe(groupsMet.length)
    }
    expect(fixtures.filter(item => item.stage === 'knockout')).toHaveLength(6 - 1)
  })

  it('refuses groups that cannot be played', () => {
    expect(() => groupStageFixtures(teams(5), { groupCount: 3, advancePerGroup: 2 })).toThrow('GROUP_TOO_SMALL')
    expect(() => groupStageFixtures(teams(8), { groupCount: 1, advancePerGroup: 2 })).toThrow('AT_LEAST_TWO_GROUPS')
    expect(() => groupStageFixtures(teams(8), { groupCount: 2, advancePerGroup: 3 })).toThrow('ADVANCE_ONE_OR_TWO')
  })
})

describe('standings', () => {
  it('ranks by points (3 win, 1 draw), then goal difference, then goals scored', () => {
    const table = standings(['A', 'B', 'C', 'D'], [
      { home: 'A', away: 'B', homeScore: 2, awayScore: 0 },
      { home: 'C', away: 'D', homeScore: 1, awayScore: 1 },
      { home: 'A', away: 'C', homeScore: 0, awayScore: 1 },
      { home: 'B', away: 'D', homeScore: 3, awayScore: 3 },
    ])
    expect(table.map(row => [row.teamId, row.played, row.points, row.goalDifference])).toEqual([
      ['C', 2, 4, 1],
      ['A', 2, 3, 1],
      ['D', 2, 2, 0],
      ['B', 2, 1, -2],
    ])
  })

  it('puts goal difference before goals scored when points are level', () => {
    // P and Q both have 4 points. P: GD +3 from 3 goals; Q: GD +1 from 6 goals.
    const table = standings(['Q', 'P', 'R', 'S'], [
      { home: 'P', away: 'R', homeScore: 3, awayScore: 0 },
      { home: 'P', away: 'S', homeScore: 0, awayScore: 0 },
      { home: 'Q', away: 'S', homeScore: 4, awayScore: 3 },
      { home: 'Q', away: 'R', homeScore: 2, awayScore: 2 },
    ])
    expect(table.slice(0, 2).map(row => [row.teamId, row.points, row.goalDifference, row.goalsFor])).toEqual([['P', 4, 3, 3], ['Q', 4, 1, 6]])
  })

  it('ignores results for teams outside the table and keeps a stable order on full ties', () => {
    const table = standings(['X', 'Y'], [{ home: 'X', away: 'Z', homeScore: 5, awayScore: 0 }])
    expect(table.map(row => [row.teamId, row.played, row.points])).toEqual([['X', 0, 0], ['Y', 0, 0]])
  })
})
