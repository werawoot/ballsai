import { describe, expect, it } from 'vitest'
import {
  addAssist, addGoal, addUnattributed, emptyEntry, performances, previewBlocker,
  teamScore, toggleCleanSheet, toggleMvp, togglePlayed, type EntryPlayer,
} from '@/lib/match-entry'

// The match-result form records a match by taps: a goal is one tap on a player's name
// and the score follows from the goals. These are the rules behind those taps, kept apart
// from the screen so the payload that reaches /api/match-results is proven, not assumed.
const players: EntryPlayer[] = [
  { id: 'a1', teamId: 'A' }, { id: 'a2', teamId: 'A' }, { id: 'a3', teamId: 'A' },
  { id: 'b1', teamId: 'B' }, { id: 'b2', teamId: 'B' },
]
const start = () => emptyEntry('A', 'B')

describe('the score follows the goals', () => {
  it('starts at 0 – 0', () => {
    expect([teamScore(start(), players, 'A'), teamScore(start(), players, 'B')]).toEqual([0, 0])
  })

  it('counts a goal for the team the scorer plays for', () => {
    let state = addGoal(start(), 'a1', 1)
    state = addGoal(state, 'a1', 1)
    state = addGoal(state, 'b2', 1)
    expect([teamScore(state, players, 'A'), teamScore(state, players, 'B')]).toEqual([2, 1])
  })

  it('adds goals whose scorer was not recorded', () => {
    const state = addUnattributed(addGoal(start(), 'a1', 1), 'B', 1)
    expect([teamScore(state, players, 'A'), teamScore(state, players, 'B')]).toEqual([1, 1])
  })

  it('never goes below 0, however many times minus is tapped', () => {
    let state = addGoal(start(), 'a1', -1)
    state = addUnattributed(state, 'A', -3)
    expect(teamScore(state, players, 'A')).toBe(0)
    expect(addGoal(start(), 'a1', 1).players.a1.goals).toBe(1)
  })

  it('ignores a goal scored by someone on neither team', () => {
    expect(teamScore(addGoal(start(), 'zz', 1), players, 'A')).toBe(0)
  })
})

describe('who played', () => {
  it('records no one until a player is tapped', () => {
    expect(performances(start(), players)).toEqual([])
  })

  it('counts a player who played without a stat once they are tapped in', () => {
    expect(performances(togglePlayed(start(), 'a2'), players)).toEqual([
      { playerRankId: 'a2', teamId: 'A', goals: 0, assists: 0, cleanSheet: false, mvp: false },
    ])
  })

  it('counts a player the moment they get a goal, assist, clean sheet or MVP', () => {
    for (const make of [
      (state: ReturnType<typeof start>) => addGoal(state, 'a1', 1),
      (state: ReturnType<typeof start>) => addAssist(state, 'a1', 1),
      (state: ReturnType<typeof start>) => toggleCleanSheet(state, 'a1'),
      (state: ReturnType<typeof start>) => toggleMvp(state, 'a1'),
    ]) {
      expect(performances(make(start()), players).map(item => item.playerRankId)).toEqual(['a1'])
    }
  })

  it('taking a player out clears what had been tapped for them', () => {
    const state = togglePlayed(toggleMvp(addGoal(start(), 'a1', 2), 'a1'), 'a1')
    expect(performances(state, players)).toEqual([])
    expect(teamScore(state, players, 'A')).toBe(0)
  })

  it('sends each player once, with their own team and stats', () => {
    let state = addGoal(start(), 'a1', 2)
    state = toggleMvp(addAssist(state, 'b1', 1), 'a1')
    const sent = performances(state, players)
    expect(sent).toEqual([
      { playerRankId: 'a1', teamId: 'A', goals: 2, assists: 0, cleanSheet: false, mvp: true },
      { playerRankId: 'b1', teamId: 'B', goals: 0, assists: 1, cleanSheet: false, mvp: false },
    ])
    expect(new Set(sent.map(item => item.playerRankId)).size).toBe(sent.length)
  })

  it('leaves out anyone from a team that is not in this match', () => {
    const state = addGoal(emptyEntry('A', 'C'), 'b1', 1)
    expect(performances(state, players)).toEqual([])
  })
})

describe('what stops the preview, and why', () => {
  it('asks for two teams first', () => {
    expect(previewBlocker(emptyEntry('', ''), players)).toBe('teams')
    expect(previewBlocker(emptyEntry('A', ''), players)).toBe('teams')
  })

  it('refuses the same team twice', () => {
    expect(previewBlocker(emptyEntry('A', 'A'), players)).toBe('sameTeam')
  })

  it('asks for at least one player, as the API does', () => {
    expect(previewBlocker(start(), players)).toBe('noPlayers')
    expect(previewBlocker(togglePlayed(start(), 'a1'), players)).toBeNull()
  })
})
