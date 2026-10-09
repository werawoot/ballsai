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
