// The rules behind recording a match by taps (/dashboard/results). A goal is one tap on a
// player's name and the score follows from the goals, so the organiser never types a score
// that disagrees with the scorers. Pure functions: every tap returns a new state, and
// `performances` is exactly what /api/match-results already accepts.

export type Side = 'A' | 'B'
export type EntryPlayer = { id: string; teamId: string }
export type PlayerEntry = { played: boolean; goals: number; assists: number; cleanSheet: boolean; mvp: boolean }
export type EntryState = {
  teamAId: string
  teamBId: string
  players: Record<string, PlayerEntry>
  // Goals scored by a team with no scorer recorded. They count for the score only.
  unattributed: Record<Side, number>
}
export type PerformanceBody = { playerRankId: string; teamId: string; goals: number; assists: number; cleanSheet: boolean; mvp: boolean }
export type PreviewBlocker = 'teams' | 'sameTeam' | 'noPlayers'

const MAX_COUNT = 99
const clamp = (value: number) => Math.min(MAX_COUNT, Math.max(0, value))
const blank = (): PlayerEntry => ({ played: false, goals: 0, assists: 0, cleanSheet: false, mvp: false })

export const emptyEntry = (teamAId = '', teamBId = ''): EntryState => ({ teamAId, teamBId, players: {}, unattributed: { A: 0, B: 0 } })
export const entryOf = (state: EntryState, id: string): PlayerEntry => state.players[id] ?? blank()

const withPlayer = (state: EntryState, id: string, change: (entry: PlayerEntry) => PlayerEntry): EntryState => {
  const next = change(entryOf(state, id))
  // A stat means the player took part, so a goal never needs a separate "played" tap.
  const played = next.played || next.goals > 0 || next.assists > 0 || next.cleanSheet || next.mvp
  return { ...state, players: { ...state.players, [id]: { ...next, played } } }
}

// Tapping a player who is in takes them out, and what was tapped for them with them.
export const togglePlayed = (state: EntryState, id: string): EntryState => {
  const { [id]: current, ...rest } = state.players
  return current?.played ? { ...state, players: rest } : withPlayer(state, id, entry => ({ ...entry, played: true }))
}
export const addGoal = (state: EntryState, id: string, delta: number): EntryState =>
  withPlayer(state, id, entry => ({ ...entry, goals: clamp(entry.goals + delta) }))
export const addAssist = (state: EntryState, id: string, delta: number): EntryState =>
  withPlayer(state, id, entry => ({ ...entry, assists: clamp(entry.assists + delta) }))
export const toggleCleanSheet = (state: EntryState, id: string): EntryState =>
  withPlayer(state, id, entry => ({ ...entry, cleanSheet: !entry.cleanSheet }))
export const toggleMvp = (state: EntryState, id: string): EntryState =>
  withPlayer(state, id, entry => ({ ...entry, mvp: !entry.mvp }))
export const addUnattributed = (state: EntryState, side: Side, delta: number): EntryState =>
  ({ ...state, unattributed: { ...state.unattributed, [side]: clamp(state.unattributed[side] + delta) } })

const teamOf = (state: EntryState, side: Side) => (side === 'A' ? state.teamAId : state.teamBId)

export function teamScore(state: EntryState, players: EntryPlayer[], side: Side): number {
  const teamId = teamOf(state, side)
  const scored = players
    .filter(player => teamId && player.teamId === teamId)
    .reduce((sum, player) => sum + entryOf(state, player.id).goals, 0)
  return scored + state.unattributed[side]
}

// The performances to send: players of the two teams in this match who played, once each.
export function performances(state: EntryState, players: EntryPlayer[]): PerformanceBody[] {
  return players
    .filter(player => player.teamId && (player.teamId === state.teamAId || player.teamId === state.teamBId))
    .flatMap(player => {
      const entry = entryOf(state, player.id)
      return entry.played
        ? [{ playerRankId: player.id, teamId: player.teamId, goals: entry.goals, assists: entry.assists, cleanSheet: entry.cleanSheet, mvp: entry.mvp }]
        : []
    })
}

// Why the preview cannot be asked for yet, in the order the organiser meets them.
export function previewBlocker(state: EntryState, players: EntryPlayer[]): PreviewBlocker | null {
  if (!state.teamAId || !state.teamBId) return 'teams'
  if (state.teamAId === state.teamBId) return 'sameTeam'
  return performances(state, players).length === 0 ? 'noPlayers' : null
}
