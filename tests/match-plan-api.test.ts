import { beforeEach, describe, expect, it, vi } from 'vitest'

// The pitch board saves each starter in the slot the coach put them in (lib/match-plan-board),
// so the API keeps a valid slot_order instead of renumbering by list order. A plan saved by
// an older page (no slot, or a clash) still saves in list order, as before.
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, auth: { getUser: async () => ({ data: { user: { id: 'coach' } } }) } }) }))

import { POST } from '@/app/api/match-plans/route'

const TEAM = '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const C = '33333333-3333-4333-8333-333333333333'
const save = (players: unknown[]) => POST(new Request('http://localhost/api/match-plans', { method: 'POST', body: JSON.stringify({ teamId: TEAM, formation: '2-3-1', players }) }))
const sent = () => rpc.mock.calls[0][1].p_players.map((row: { slot_order: number }) => row.slot_order)

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ data: 'plan-1', error: null }) })

describe('saving a match plan from the pitch board', () => {
  it('keeps the slot each starter was placed in', async () => {
    const response = await save([
      { athlete_id: A, lineup_role: 'starter', position: 'GK', slot_order: 0 },
      { athlete_id: B, lineup_role: 'starter', position: 'FW', slot_order: 6 },
      { athlete_id: C, lineup_role: 'substitute', position: 'MF', slot_order: 7 },
    ])
    expect(response.status).toBe(200)
    expect(sent()).toEqual([0, 6, 7])
  })

  it('numbers by list order when slots are missing, clash or are out of range', async () => {
    await save([{ athlete_id: A, lineup_role: 'starter', position: 'GK' }, { athlete_id: B, lineup_role: 'starter', position: 'DF' }])
    expect(sent()).toEqual([0, 1])
    rpc.mockClear()
    await save([{ athlete_id: A, lineup_role: 'starter', position: 'GK', slot_order: 3 }, { athlete_id: B, lineup_role: 'starter', position: 'DF', slot_order: 3 }])
    expect(sent()).toEqual([0, 1])
    rpc.mockClear()
    await save([{ athlete_id: A, lineup_role: 'starter', position: 'GK', slot_order: 30 }])
    expect(sent()).toEqual([0])
  })
})
