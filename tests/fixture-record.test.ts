import { describe, expect, it } from 'vitest'
import { pickInitialTeams, recordableFixtureKeys, recordResultHref } from '@/lib/fixture-record'

// A fixture whose two teams are known and which has no result yet can send the organiser
// to /dashboard/results with those two teams chosen. SQL56 links a recorded result to the
// FIRST free fixture of the pair (groups, then league, then knockout; by round, then key),
// so only that fixture offers the button: the others would link to the same one.
const fixture = (over: Partial<Parameters<typeof recordableFixtureKeys>[0][number]> & { fixture_key: string }) => ({
  stage: 'knockout' as const, round: 1, home_team_id: 'A', away_team_id: 'B', match_result_id: null as string | null, ...over,
})

describe('which fixtures offer "record the result"', () => {
  it('offers it for a fixture with both teams and no result', () => {
    expect([...recordableFixtureKeys([fixture({ fixture_key: 'KO-R1-M1' })])]).toEqual(['KO-R1-M1'])
  })

  it('does not offer it before both teams are known', () => {
    const keys = recordableFixtureKeys([
      fixture({ fixture_key: 'KO-R2-M1', home_team_id: null }),
      fixture({ fixture_key: 'KO-R2-M2', away_team_id: null }),
    ])
    expect(keys.size).toBe(0)
  })

  it('does not offer it once a result is linked', () => {
    expect(recordableFixtureKeys([fixture({ fixture_key: 'KO-R1-M1', match_result_id: 'r1' })]).size).toBe(0)
  })

  it('offers it only for the first free fixture of the same two teams, whichever side is home', () => {
    const keys = recordableFixtureKeys([
      fixture({ fixture_key: 'L-R2-M1', stage: 'league', round: 2, home_team_id: 'B', away_team_id: 'A' }),
      fixture({ fixture_key: 'L-R1-M1', stage: 'league', round: 1, home_team_id: 'A', away_team_id: 'B' }),
    ])
    expect([...keys]).toEqual(['L-R1-M1'])
  })

  it('moves to the next fixture of the pair once the first has its result', () => {
    const keys = recordableFixtureKeys([
      fixture({ fixture_key: 'L-R1-M1', stage: 'league', round: 1, match_result_id: 'r1' }),
      fixture({ fixture_key: 'L-R2-M1', stage: 'league', round: 2, home_team_id: 'B', away_team_id: 'A' }),
    ])
    expect([...keys]).toEqual(['L-R2-M1'])
  })

  it('orders groups before league before knockout, as SQL56 does, whatever the input order', () => {
    const rows = [
      fixture({ fixture_key: 'KO-R1-M1', stage: 'knockout', round: 1 }),
      fixture({ fixture_key: 'G-A-R1-M1', stage: 'group', round: 1 }),
      fixture({ fixture_key: 'L-R1-M1', stage: 'league', round: 1 }),
    ]
    expect([...recordableFixtureKeys(rows)]).toEqual(['G-A-R1-M1'])
    expect([...recordableFixtureKeys([...rows].reverse())]).toEqual(['G-A-R1-M1'])
  })

  it('treats different pairs independently', () => {
    const keys = recordableFixtureKeys([
      fixture({ fixture_key: 'KO-R1-M1' }),
      fixture({ fixture_key: 'KO-R1-M2', home_team_id: 'C', away_team_id: 'D' }),
    ])
    expect([...keys].sort()).toEqual(['KO-R1-M1', 'KO-R1-M2'])
  })
})

describe('the link to the result form', () => {
  it('names the tournament and both teams, escaped', () => {
    expect(recordResultHref('t 1', { home_team_id: 'a&b', away_team_id: 'c' }))
      .toBe('/dashboard/results?tournament=t%201&teamA=a%26b&teamB=c')
  })
})

describe('the two teams the result form starts with', () => {
  const teams = ['A', 'B', 'C']
  it('takes two different confirmed teams of this tournament', () => {
    expect(pickInitialTeams('A', 'C', teams)).toEqual({ teamAId: 'A', teamBId: 'C' })
  })
  it('ignores a team that is not in this tournament, both missing, or the same team twice', () => {
    for (const [a, b] of [['A', 'Z'], ['Z', 'B'], [undefined, 'B'], ['A', undefined], ['A', 'A'], ['', '']] as const) {
      expect(pickInitialTeams(a, b, teams)).toEqual({ teamAId: '', teamBId: '' })
    }
  })
})
