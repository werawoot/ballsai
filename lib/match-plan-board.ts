// The coach's pitch board on /match-plan, as plain functions. A formation is the outfield
// rows from the back ("2-3-1"); slot 0 is always the keeper. The board is stored in the rows
// sql/28 already has: a starter's slot_order is the slot on the pitch and its position comes
// from the slot's row; the bench follows the pitch in order. No new SQL.

export type BoardPosition = 'GK' | 'DF' | 'MF' | 'FW'
export type BoardSlot = { index: number; position: BoardPosition; x: number; y: number }
export type BoardState = { formation: string; slots: (string | null)[]; bench: string[] }
export type BoardRosterMember = { athlete_id: string; lineup_role: 'starter' | 'substitute' | null; slot_order: number | null }
export type BoardPlayerRow = { athlete_id: string; lineup_role: 'starter' | 'substitute'; position: BoardPosition; slot_order: number }

// 5-a-side and 7-a-side shapes for youth football first, then 11-a-side.
export const BOARD_FORMATIONS = ['1-2-1', '2-2-1', '2-3-1', '3-2-1', '3-3-1', '4-3-3', '4-4-2', '3-5-2'] as const
export const DEFAULT_FORMATION = '2-3-1'
const POSITIONS: readonly string[] = ['GK', 'DF', 'MF', 'FW']

function rows(formation: string): number[] {
  const parts = formation.split('-').map(Number)
  const valid = parts.length >= 2 && parts.every(n => Number.isInteger(n) && n >= 1 && n <= 6) && parts.reduce((sum, n) => sum + n, 0) <= 10
  return valid ? parts : rows(DEFAULT_FORMATION)
}

export function formationSlots(formation: string): BoardSlot[] {
  const lines = rows(formation)
  const round = (value: number) => Math.round(value * 10) / 10
  const slots: BoardSlot[] = [{ index: 0, position: 'GK', x: 50, y: 90 }]
  lines.forEach((count, row) => {
    const position: BoardPosition = row === 0 ? 'DF' : row === lines.length - 1 ? 'FW' : 'MF'
    const y = lines.length > 1 ? 72 - row * (54 / (lines.length - 1)) : 47
    for (let i = 0; i < count; i++) slots.push({ index: slots.length, position, x: round((i + 1) / (count + 1) * 100), y: round(y) })
  })
  return slots
}

export function boardFromRoster(roster: BoardRosterMember[], formation: string): BoardState {
  const size = formationSlots(formation).length
  const slots: (string | null)[] = Array(size).fill(null)
  const order = (member: BoardRosterMember) => (Number.isInteger(member.slot_order) ? member.slot_order! : 99)
  const starters = roster.filter(member => member.lineup_role === 'starter').sort((a, b) => order(a) - order(b))
  const unplaced: string[] = []
  for (const member of starters) {
    const slot = member.slot_order
    if (Number.isInteger(slot) && slot! >= 0 && slot! < size && !slots[slot!]) slots[slot!] = member.athlete_id
    else unplaced.push(member.athlete_id)
  }
  const overflow: string[] = []
  for (const id of unplaced) {
    const free = slots.indexOf(null)
    if (free >= 0) slots[free] = id
    else overflow.push(id)
  }
  const bench = roster.filter(member => member.lineup_role === 'substitute').sort((a, b) => order(a) - order(b)).map(member => member.athlete_id)
  return { formation, slots, bench: [...overflow, ...bench] }
}

export function placePlayer(state: BoardState, slotIndex: number, athleteId: string): BoardState {
  const slots = [...state.slots]
  const from = slots.indexOf(athleteId)
  if (from === slotIndex || slotIndex < 0 || slotIndex >= slots.length) return state
  const current = slots[slotIndex]
  let bench = state.bench.filter(id => id !== athleteId)
  if (from >= 0) slots[from] = current
  else if (current) bench = [...bench, current]
  slots[slotIndex] = athleteId
  return { ...state, slots, bench }
}

export function benchPlayer(state: BoardState, athleteId: string): BoardState {
  const slots = state.slots.map(id => (id === athleteId ? null : id))
  return { ...state, slots, bench: state.bench.includes(athleteId) ? state.bench : [...state.bench, athleteId] }
}

export function removePlayer(state: BoardState, athleteId: string): BoardState {
  return { ...state, slots: state.slots.map(id => (id === athleteId ? null : id)), bench: state.bench.filter(id => id !== athleteId) }
}

export function changeFormation(state: BoardState, formation: string): BoardState {
  const size = formationSlots(formation).length
  const onPitch = state.slots.filter((id): id is string => Boolean(id))
  const slots = [...onPitch.slice(0, size), ...Array(Math.max(0, size - onPitch.length)).fill(null)]
  return { formation, slots, bench: [...onPitch.slice(size), ...state.bench] }
}

export function boardToPlayers(state: BoardState, profilePositions: Record<string, string | null | undefined> = {}): BoardPlayerRow[] {
  const layout = formationSlots(state.formation)
  const starters = state.slots.flatMap((id, index): BoardPlayerRow[] => (id ? [{ athlete_id: id, lineup_role: 'starter', position: layout[index]?.position ?? 'MF', slot_order: index }] : []))
  const bench = state.bench.map((id, index): BoardPlayerRow => {
    const own = profilePositions[id]
    return { athlete_id: id, lineup_role: 'substitute', position: own && POSITIONS.includes(own) ? own as BoardPosition : 'MF', slot_order: layout.length + index }
  })
  return [...starters, ...bench]
}

// A draft board for a coach with no team yet, or a team nobody has accepted: names typed by
// the coach, kept only in this browser (localStorage), never sent anywhere. It becomes a real
// plan once players accept and the coach places them. Read defensively: storage is the
// viewer's to change.
export type DraftPlayer = { id: string; name: string }
export type DraftPlan = { board: BoardState; players: DraftPlayer[]; focus: string; talk: string }
export const DRAFT_NAME_MAX = 60
export const DRAFT_PLAYERS_MAX = 25

export function draftKey(teamId: string) {
  return `bds-match-plan-draft:${teamId || 'no-team'}`
}

export function writeDraft(draft: DraftPlan) {
  return JSON.stringify(draft)
}

export function readDraft(raw: string | null): DraftPlan | null {
  let value: unknown
  try { value = JSON.parse(raw ?? '') } catch { return null }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const draft = value as { board?: { formation?: unknown; slots?: unknown; bench?: unknown }; players?: unknown; focus?: unknown; talk?: unknown }
  if (!draft.board || typeof draft.board !== 'object' || !Array.isArray(draft.players)) return null
  const players: DraftPlayer[] = []
  for (const item of draft.players as { id?: unknown; name?: unknown }[]) {
    if (players.length >= DRAFT_PLAYERS_MAX) break
    if (!item || typeof item.id !== 'string' || typeof item.name !== 'string' || !item.name.trim() || players.some(player => player.id === item.id)) continue
    players.push({ id: item.id, name: item.name.trim().slice(0, DRAFT_NAME_MAX) })
  }
  const known = new Set(players.map(player => player.id))
  const formation = typeof draft.board.formation === 'string' && (BOARD_FORMATIONS as readonly string[]).includes(draft.board.formation) ? draft.board.formation : DEFAULT_FORMATION
  const used = new Set<string>()
  const take = (id: unknown) => (typeof id === 'string' && known.has(id) && !used.has(id) ? (used.add(id), id) : null)
  const savedSlots = Array.isArray(draft.board.slots) ? draft.board.slots : []
  const slots = formationSlots(formation).map((_, index) => take(savedSlots[index]))
  const bench = (Array.isArray(draft.board.bench) ? draft.board.bench : []).map(take).filter((id): id is string => id !== null)
  const text = (value: unknown) => (typeof value === 'string' ? value.slice(0, 1000) : '')
  return { board: { formation, slots, bench }, players, focus: text(draft.focus), talk: text(draft.talk) }
}
