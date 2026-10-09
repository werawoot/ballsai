import { describe, expect, it } from 'vitest'
import { teamMatchIds, teamSeasonStats, teamSheet } from '@/lib/team-stats'

const roster = [
  { athleteId: 'a-ton', name: 'ต้น', position: 'FW' },
  { athleteId: 'a-palm', name: 'ปาล์ม', position: 'GK' },
  { athleteId: 'a-new', name: 'เจ', position: null },
]
const ranks = [{ id: 'r-ton', player_id: 'a-ton' }, { id: 'r-palm', player_id: 'a-palm' }, { id: 'r-gone', player_id: 'a-gone' }]

describe("a team's confirmed matches", () => {
  it('keeps only confirmed matches this team played in', () => {
    expect(teamMatchIds([
      { id: 'm1', team_a_id: 't1', team_b_id: 't2', status: 'confirmed' },
      { id: 'm2', team_a_id: 't3', team_b_id: 't1', status: 'confirmed' },
      { id: 'm3', team_a_id: 't1', team_b_id: 't4', status: 'void' },
      { id: 'm4', team_a_id: 't2', team_b_id: 't3', status: 'confirmed' },
    ], 't1')).toEqual(['m1', 'm2'])
  })
})

describe("a team's season, from verified results only", () => {
  const performances = [
    { player_rank_id: 'r-ton', goals: 2, assists: 1, mvp: true },
    { player_rank_id: 'r-ton', goals: 1, assists: 0, mvp: false },
    { player_rank_id: 'r-palm', goals: 0, assists: 0, mvp: false },
    { player_rank_id: 'r-gone', goals: 5, assists: 0, mvp: false },
  ]

  it('adds up each member and orders by matches then goals', () => {
    const rows = teamSeasonStats(roster, performances, ranks)
    expect(rows.map(row => [row.name, row.matches, row.goals, row.assists, row.mvps])).toEqual([
      ['ต้น', 2, 3, 1, 1],
      ['ปาล์ม', 1, 0, 0, 0],
      ['เจ', null, null, null, null],
    ])
  })

  it('shows no number for a member without a verified match (rule 8), not a zero', () => {
    expect(teamSeasonStats(roster, [], ranks).every(row => row.matches === null && row.goals === null)).toBe(true)
  })

  it('leaves out someone no longer on the roster', () => {
    expect(teamSeasonStats(roster, performances, ranks).some(row => row.athleteId === 'a-gone')).toBe(false)
  })

  it('treats a missing or negative count as nothing', () => {
    const rows = teamSeasonStats(roster, [{ player_rank_id: 'r-ton', goals: null, assists: -2, mvp: null }], ranks)
    expect(rows[0]).toMatchObject({ matches: 1, goals: 0, assists: 0, mvps: 0 })
  })
})

describe('the team sheet', () => {
  it('lists keeper, defenders, midfield, forwards, then unknown, by name within each', () => {
    const sheet = teamSheet([
      { athleteId: '1', name: 'ต้น', position: 'FW' },
      { athleteId: '2', name: 'บอส', position: 'DF' },
      { athleteId: '3', name: 'ปาล์ม', position: 'GK' },
      { athleteId: '4', name: 'เจ', position: null },
      { athleteId: '5', name: 'กร', position: 'DF' },
    ])
    expect(sheet.map(row => [row.no, row.name, row.position])).toEqual([[1, 'ปาล์ม', 'GK'], [2, 'กร', 'DF'], [3, 'บอส', 'DF'], [4, 'ต้น', 'FW'], [5, 'เจ', null]])
  })

  it('carries only a name and a position, nothing private', () => {
    const [row] = teamSheet([{ athleteId: '1', name: 'ต้น', position: 'FW', birthDate: '2014-01-01' } as never])
    expect(Object.keys(row).sort()).toEqual(['name', 'no', 'position'])
  })
})
