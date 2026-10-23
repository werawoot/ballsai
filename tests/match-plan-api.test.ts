import { beforeEach, describe, expect, it, vi } from 'vitest'

// The pitch board saves each starter in the slot the coach put them in (lib/match-plan-board),
// so the API keeps a valid slot_order instead of renumbering by list order. A plan saved by
// an older page (no slot, or a clash) still saves in list order, as before.
const rpc = vi.hoisted(() => vi.fn())
// Photos for the roster list: athlete_profiles rows the viewer's RLS lets through, and the
// private avatar bucket signing only what storage RLS allows (lib/athlete-avatar).
const photos = vi.hoisted(() => ({ rows: [] as { user_id: string; profile_image_url: string | null }[], readError: null as unknown, asked: [] as string[][] }))
const from = vi.hoisted(() => vi.fn(() => ({ select: () => ({ in: async (_column: string, ids: string[]) => { photos.asked.push(ids); return { data: photos.readError ? null : photos.rows, error: photos.readError } } }) })))
const storage = vi.hoisted(() => ({ from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://signed/${path}`, error: null })), error: null }) }) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: true }) }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ rpc, from, storage, auth: { getUser: async () => ({ data: { user: { id: 'coach' } } }) } }) }))

import { GET, POST } from '@/app/api/match-plans/route'

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

  it('passes a starter\'s point on the pitch through, and none for a substitute', async () => {
    const response = await save([
      { athlete_id: A, lineup_role: 'starter', position: 'FW', slot_order: 6, pos_x: 40, pos_y: 12 },
      { athlete_id: B, lineup_role: 'substitute', position: 'MF', slot_order: 7 },
    ])
    expect(response.status).toBe(200)
    expect(rpc.mock.calls[0][1].p_players).toEqual([
      { athlete_id: A, lineup_role: 'starter', position: 'FW', slot_order: 6, pos_x: 40, pos_y: 12 },
      { athlete_id: B, lineup_role: 'substitute', position: 'MF', slot_order: 7, pos_x: null, pos_y: null },
    ])
  })

  it('refuses a point it cannot store, before the database is asked', async () => {
    for (const bad of [{ pos_x: 40 }, { pos_x: 101, pos_y: 5 }, { pos_x: 4.5, pos_y: 5 }, { pos_x: '40', pos_y: 5 }]) {
      expect((await save([{ athlete_id: A, lineup_role: 'starter', position: 'FW', slot_order: 0, ...bad }])).status).toBe(400)
    }
    expect((await save([{ athlete_id: B, lineup_role: 'substitute', position: 'MF', slot_order: 7, pos_x: 5, pos_y: 5 }])).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})

describe('loading a match plan with the roster photos', () => {
  const roster = [{ athlete_id: A, display_name: 'Nong A' }, { athlete_id: B, display_name: 'Nong B' }]
  const load = () => GET(new Request(`http://localhost/api/match-plans?teamId=${TEAM}`))
  beforeEach(() => {
    rpc.mockResolvedValue({ data: { plan: null, roster }, error: null })
    photos.rows = []; photos.readError = null; photos.asked = []
  })

  it('adds a signed photo for each member whose photo the viewer may see, and none for the rest', async () => {
    photos.rows = [{ user_id: A, profile_image_url: `${A}/face.webp` }]
    const body = await (await load()).json()
    expect(photos.asked).toEqual([[A, B]])
    expect(body.data.roster).toEqual([
      { athlete_id: A, display_name: 'Nong A', avatar_url: `https://signed/${A}/face.webp` },
      { athlete_id: B, display_name: 'Nong B', avatar_url: null },
    ])
  })

  it('still loads the plan, without photos, when the photo read fails', async () => {
    photos.readError = { message: 'timeout' }
    const response = await load()
    expect(response.status).toBe(200)
    expect((await response.json()).data.roster.map((member: { avatar_url: unknown }) => member.avatar_url)).toEqual([null, null])
  })

  it('asks for no photos when nobody is on the roster', async () => {
    rpc.mockResolvedValue({ data: { plan: null, roster: [] }, error: null })
    await load()
    expect(photos.asked).toEqual([])
  })
})
