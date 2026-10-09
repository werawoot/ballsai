import { describe, expect, it } from 'vitest'
import { BOARD_FORMATIONS, boardFromRoster, boardToPlayers, changeFormation, formationSlots, placePlayer, removePlayer, type BoardState } from '@/lib/match-plan-board'

const member = (id: string, role: 'starter' | 'substitute' | null = null, slot: number | null = null, position: 'GK' | 'DF' | 'MF' | 'FW' | null = null) => ({
  athlete_id: id, display_name: id, profile_position: null, lineup_role: role, position, slot_order: slot,
})

describe('formation slots on the pitch', () => {
  it('always has one keeper, then the rows from the back', () => {
    const slots = formationSlots('2-3-1')
    expect(slots.map(slot => slot.position)).toEqual(['GK', 'DF', 'DF', 'MF', 'MF', 'MF', 'FW'])
    expect(slots.map(slot => slot.index)).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('puts the keeper at the bottom and the forwards at the top, spread across', () => {
    const slots = formationSlots('4-3-3')
    expect(slots).toHaveLength(11)
    expect(slots[0]).toMatchObject({ x: 50 })
    expect(slots[0].y).toBeGreaterThan(slots[1].y)
    expect(slots[10].y).toBeLessThan(slots[5].y)
    expect(slots.slice(1, 5).map(slot => slot.x)).toEqual([20, 40, 60, 80])
  })

  it('reads every formation it offers, from 5-a-side to 11-a-side', () => {
    for (const formation of BOARD_FORMATIONS) expect(formationSlots(formation).length).toBe(1 + formation.split('-').reduce((sum, n) => sum + Number(n), 0))
    expect(BOARD_FORMATIONS).toEqual(expect.arrayContaining(['1-2-1', '2-3-1', '4-3-3', '4-4-2']))
  })

  it('falls back to a 7-a-side shape for a formation it cannot read', () => {
    expect(formationSlots('banana')).toHaveLength(7)
  })
})

describe('a saved plan back onto the board', () => {
  it('puts each starter in the slot it was saved in and the bench in order', () => {
    const board = boardFromRoster([member('a', 'starter', 3), member('b', 'starter', 0), member('c', 'substitute', 9), member('d', 'substitute', 8), member('e')], '2-3-1')
    expect(board.slots[0]).toBe('b')
    expect(board.slots[3]).toBe('a')
    expect(board.bench).toEqual(['d', 'c'])
  })

  it('fills free slots with starters saved the old way (by list order), never two in one slot', () => {
    const board = boardFromRoster([member('a', 'starter', 0), member('b', 'starter', 0), member('c', 'starter', 20)], '1-2-1')
    expect(board.slots.filter(Boolean).sort()).toEqual(['a', 'b', 'c'])
  })

  it('sends starters with no room on the pitch to the bench', () => {
    const board = boardFromRoster(['a', 'b', 'c', 'd', 'e', 'f'].map((id, index) => member(id, 'starter', index)), '1-2-1')
    expect(board.slots).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(board.bench).toEqual(['f'])
  })
})

describe('tapping on the board', () => {
  const empty = (): BoardState => ({ formation: '1-2-1', slots: [null, null, null, null, null], bench: [] })

  it('places a player in a slot and swaps out whoever was there to the bench', () => {
    let board = placePlayer(empty(), 2, 'a')
    board = placePlayer(board, 2, 'b')
    expect(board.slots[2]).toBe('b')
    expect(board.bench).toEqual(['a'])
  })

  it('moves a player already on the pitch rather than copying them', () => {
    let board = placePlayer(empty(), 1, 'a')
    board = placePlayer(board, 4, 'a')
    expect(board.slots).toEqual([null, null, null, null, 'a'])
  })

  it('swaps two players on the pitch', () => {
    let board = placePlayer(placePlayer(empty(), 1, 'a'), 4, 'b')
    board = placePlayer(board, 1, 'b')
    expect(board.slots).toEqual([null, 'b', null, null, 'a'])
  })

  it('takes a bench player off the bench when they start', () => {
    const board = placePlayer({ ...empty(), bench: ['a', 'b'] }, 0, 'a')
    expect(board.bench).toEqual(['b'])
  })

  it('removes a player from the plan entirely', () => {
    const board = removePlayer({ ...empty(), slots: ['a', null, null, null, null], bench: ['b'] }, 'a')
    expect(board.slots[0]).toBeNull()
    expect(removePlayer(board, 'b').bench).toEqual([])
  })

  it('keeps the players in order when the formation changes, overflow to the bench', () => {
    const board = changeFormation({ formation: '2-3-1', slots: ['g', 'a', null, 'b', 'c', 'd', 'e'], bench: ['x'] }, '1-2-1')
    expect(board.slots).toEqual(['g', 'a', 'b', 'c', 'd'])
    expect(board.bench).toEqual(['e', 'x'])
  })
})

describe('the board saved as plan rows', () => {
  it('saves each starter with its slot and position, the bench after the pitch', () => {
    const players = boardToPlayers({ formation: '1-2-1', slots: ['g', null, 'm', null, 'f'], bench: ['s1', 's2'] })
    expect(players).toEqual([
      { athlete_id: 'g', lineup_role: 'starter', position: 'GK', slot_order: 0 },
      { athlete_id: 'm', lineup_role: 'starter', position: 'MF', slot_order: 2 },
      { athlete_id: 'f', lineup_role: 'starter', position: 'FW', slot_order: 4 },
      { athlete_id: 's1', lineup_role: 'substitute', position: 'MF', slot_order: 5 },
      { athlete_id: 's2', lineup_role: 'substitute', position: 'MF', slot_order: 6 },
    ])
  })

  it('keeps a substitute their profile position when it is a known one', () => {
    const players = boardToPlayers({ formation: '1-2-1', slots: [null, null, null, null, null], bench: ['s'] }, { s: 'GK' })
    expect(players[0]).toMatchObject({ position: 'GK' })
  })

  it('round-trips through the saved rows', () => {
    const state: BoardState = { formation: '2-3-1', slots: ['g', null, 'd', 'm1', null, 'm3', 'f'], bench: ['s'] }
    const rows = boardToPlayers(state).map(row => member(row.athlete_id, row.lineup_role, row.slot_order, row.position))
    expect(boardFromRoster(rows, '2-3-1')).toEqual(state)
  })
})
