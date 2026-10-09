import { describe, expect, it } from 'vitest'
import { BOARD_FORMATIONS, boardFromRoster, boardLayout, boardToPlayers, changeFormation, dropOnPitch, formationSlots, movePlayer, placePlayer, removePlayer, resetPoints, type BoardState, draftKey, readDraft, writeDraft } from '@/lib/match-plan-board'

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
      { athlete_id: 'g', lineup_role: 'starter', position: 'GK', slot_order: 0, pos_x: null, pos_y: null },
      { athlete_id: 'm', lineup_role: 'starter', position: 'MF', slot_order: 2, pos_x: null, pos_y: null },
      { athlete_id: 'f', lineup_role: 'starter', position: 'FW', slot_order: 4, pos_x: null, pos_y: null },
      { athlete_id: 's1', lineup_role: 'substitute', position: 'MF', slot_order: 5, pos_x: null, pos_y: null },
      { athlete_id: 's2', lineup_role: 'substitute', position: 'MF', slot_order: 6, pos_x: null, pos_y: null },
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

describe('a draft plan kept on this device (no team or no accepted players yet)', () => {
  const players = [{ id: 'draft-1', name: 'ก้อง' }, { id: 'draft-2', name: 'บอส' }, { id: 'draft-3', name: 'ฟ้า' }]

  it('round-trips the board, the typed names and the notes', () => {
    const draft = { board: { formation: '1-2-1', slots: ['draft-1', null, 'draft-2', null, null], bench: ['draft-3'] }, players, focus: 'กดดัน', talk: 'สู้ ๆ' }
    expect(readDraft(writeDraft(draft))).toEqual(draft)
  })

  it('has no draft for nothing stored or something it cannot read', () => {
    for (const raw of [null, '', 'not json', '{"board":1}', '[]']) expect(readDraft(raw)).toBeNull()
  })

  it('drops names it does not know, repeats and slots past the formation', () => {
    const raw = JSON.stringify({ board: { formation: '1-2-1', slots: ['draft-1', 'ghost', 'draft-1', null, null, 'draft-2'], bench: ['draft-2', 'draft-2', 'ghost'] }, players, focus: '', talk: '' })
    expect(readDraft(raw)!.board).toEqual({ formation: '1-2-1', slots: ['draft-1', null, null, null, null], bench: ['draft-2'] })
  })

  it('keeps names short and the squad within 25, and falls back to a known formation', () => {
    const many = Array.from({ length: 40 }, (_, index) => ({ id: `draft-${index}`, name: 'x'.repeat(100) }))
    const draft = readDraft(JSON.stringify({ board: { formation: 'banana', slots: [], bench: [] }, players: many, focus: '', talk: '' }))!
    expect(draft.players).toHaveLength(25)
    expect(draft.players[0].name).toHaveLength(60)
    expect(draft.board.formation).toBe('2-3-1')
    expect(draft.board.slots).toHaveLength(7)
  })

  it('is stored per team, with one key for a coach who has no team yet', () => {
    expect(draftKey('team-1')).toBe('bds-match-plan-draft:team-1')
    expect(draftKey('')).toBe('bds-match-plan-draft:no-team')
  })
})

describe('dragging players anywhere on the pitch (SQL68 stores the point)', () => {
  const base = (): BoardState => ({ formation: '1-2-1', slots: ['g', 'd', 'm1', 'm2', 'f'], bench: ['s'] })

  it('moves a player to where they were dropped, inside the pitch, in whole percent', () => {
    const board = movePlayer(base(), 4, 61.4, 12.6)
    expect(board.points![4]).toEqual({ x: 61, y: 13 })
    expect(movePlayer(base(), 4, 140, -20).points![4]).toEqual({ x: 100, y: 0 })
  })

  it('draws each slot at its own point, or at the formation spot when it has none', () => {
    const layout = boardLayout(movePlayer(base(), 2, 20, 20))
    expect(layout[2]).toMatchObject({ x: 20, y: 20 })
    expect(layout[3]).toMatchObject(formationSlots('1-2-1')[3])
  })

  it('names the position from where the player stands; the keeper slot stays the keeper', () => {
    expect(boardLayout(movePlayer(base(), 1, 50, 20))[1].position).toBe('FW')
    expect(boardLayout(movePlayer(base(), 4, 50, 70))[4].position).toBe('DF')
    expect(boardLayout(movePlayer(base(), 4, 50, 45))[4].position).toBe('MF')
    expect(boardLayout(movePlayer(base(), 0, 50, 20))[0].position).toBe('GK')
  })

  it('dropping onto another player swaps them, each taking the other\'s spot', () => {
    const moved = movePlayer(base(), 4, 70, 10)
    const board = dropOnPitch(moved, 'd', 70, 11)
    expect(board.slots[4]).toBe('d')
    expect(board.slots[1]).toBe('f')
    expect(board.points![4]).toEqual({ x: 70, y: 10 })
  })

  it('dropping a player on open grass moves them there', () => {
    const board = dropOnPitch(base(), 'm1', 10, 50)
    expect(board.slots[2]).toBe('m1')
    expect(board.points![2]).toEqual({ x: 10, y: 50 })
  })

  it('dropping a substitute on open grass takes the nearest free slot, at that point', () => {
    const board = dropOnPitch({ ...base(), slots: ['g', null, 'm1', 'm2', null] }, 's', 80, 15)
    expect(board.slots[4]).toBe('s')
    expect(board.points![4]).toEqual({ x: 80, y: 15 })
    expect(board.bench).toEqual([])
  })

  it('with no free slot, the nearest starter goes to the bench', () => {
    const board = dropOnPitch(base(), 's', 50, 20)
    expect(board.slots[4]).toBe('s')
    expect(board.bench).toEqual(['f'])
  })

  it('a new formation, or a reset, puts everyone back on the formation spots', () => {
    expect(changeFormation(movePlayer(base(), 4, 1, 1), '2-2-1').points).toBeUndefined()
    expect(resetPoints(movePlayer(base(), 4, 1, 1)).points).toBeUndefined()
  })

  it('saves the point with each starter and reads it back', () => {
    const board = movePlayer(base(), 4, 30, 8)
    const rows = boardToPlayers(board)
    expect(rows.find(row => row.athlete_id === 'f')).toMatchObject({ pos_x: 30, pos_y: 8, position: 'FW', slot_order: 4 })
    expect(rows.find(row => row.athlete_id === 'd')).toMatchObject({ pos_x: null, pos_y: null })
    expect(rows.find(row => row.athlete_id === 's')).toMatchObject({ pos_x: null, pos_y: null })
    const back = boardFromRoster(rows.map(row => ({ ...row })), '1-2-1')
    expect(back.points![4]).toEqual({ x: 30, y: 8 })
    expect(back.points![1]).toBeNull()
  })

  it('ignores a stored point it cannot trust', () => {
    const back = boardFromRoster([{ athlete_id: 'a', lineup_role: 'starter', slot_order: 0, pos_x: 50, pos_y: null }, { athlete_id: 'b', lineup_role: 'starter', slot_order: 1, pos_x: 300, pos_y: 5 }], '1-2-1')
    expect(back.points).toBeUndefined()
  })

  it('keeps the points in a draft too', () => {
    const draft = { board: movePlayer({ formation: '1-2-1', slots: ['draft-1', null, null, null, null], bench: [] }, 0, 40, 95), players: [{ id: 'draft-1', name: 'ก้อง' }], focus: '', talk: '' }
    expect(readDraft(writeDraft(draft))!.board.points![0]).toEqual({ x: 40, y: 95 })
  })
})
