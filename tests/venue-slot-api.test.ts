import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseBoundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: supabaseBoundary.getUser },
    rpc: supabaseBoundary.rpc,
  }),
}))

import { POST } from '@/app/api/venue-slots/route'
import { DELETE } from '@/app/api/venue-slots/[slotId]/route'

const SLOT_ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'

const deleteRequest = (slotId: string = SLOT_ID) =>
  new Request(`http://localhost/api/venue-slots/${slotId}`, { method: 'DELETE' })

const callDelete = (slotId: string = SLOT_ID) =>
  DELETE(deleteRequest(slotId), { params: { slotId } })

const createSlotRequest = () => new Request('http://localhost/api/venue-slots', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    courtId: SLOT_ID,
    startsAt: '2026-09-22T10:00',
    endsAt: '2026-09-22T11:00',
    priceBaht: 500,
  }),
})

const signedInAs = (id: string) =>
  supabaseBoundary.getUser.mockResolvedValue({ data: { user: { id } } })

const rpcFails = (error: { code?: string; message: string }) =>
  supabaseBoundary.rpc.mockResolvedValue({ error })

describe('POST /api/venue-slots', () => {
  beforeEach(() => {
    supabaseBoundary.getUser.mockReset()
    supabaseBoundary.rpc.mockReset()
  })

  it('treats datetime-local slot times as Asia/Bangkok time on a UTC server', async () => {
    signedInAs('owner-1')
    supabaseBoundary.rpc.mockResolvedValue({ data: SLOT_ID, error: null })

    const response = await POST(createSlotRequest())

    expect(response.status).toBe(200)
    expect(supabaseBoundary.rpc).toHaveBeenCalledWith('create_venue_slot_safely', {
      p_court_id: SLOT_ID,
      p_starts_at: '2026-09-22T03:00:00.000Z',
      p_ends_at: '2026-09-22T04:00:00.000Z',
      p_price_baht: 500,
    })
  })
})

describe('DELETE /api/venue-slots/:slotId', () => {
  beforeEach(() => {
    supabaseBoundary.getUser.mockReset()
    supabaseBoundary.rpc.mockReset()
  })

  it('requires a signed-in user', async () => {
    supabaseBoundary.getUser.mockResolvedValue({ data: { user: null } })

    const response = await callDelete()

    expect(response.status).toBe(401)
    expect(supabaseBoundary.rpc).not.toHaveBeenCalled()
  })

  it('rejects a slot id that is not a uuid without touching the database', async () => {
    signedInAs('owner-1')

    const response = await callDelete('slot-1')

    expect(response.status).toBe(400)
    expect(supabaseBoundary.rpc).not.toHaveBeenCalled()
  })

  it('closes an available slot for its owner', async () => {
    signedInAs('owner-1')
    supabaseBoundary.rpc.mockResolvedValue({ error: null })

    const response = await callDelete()

    expect(response.status).toBe(200)
    expect(supabaseBoundary.rpc).toHaveBeenCalledWith('close_venue_slot_safely', {
      p_slot_id: SLOT_ID,
    })
  })

  it('blocks a user who does not own the venue', async () => {
    signedInAs('user-2')
    rpcFails({ code: '42501', message: 'VENUE_OWNER_REQUIRED' })

    const response = await callDelete()

    expect(response.status).toBe(403)
  })

  it('maps a lost session inside the rpc to 401', async () => {
    signedInAs('owner-1')
    rpcFails({ code: '42501', message: 'AUTH_REQUIRED' })

    const response = await callDelete()

    expect(response.status).toBe(401)
  })

  it('reports an unknown slot as 404', async () => {
    signedInAs('owner-1')
    rpcFails({ code: 'P0002', message: 'SLOT_NOT_FOUND' })

    const response = await callDelete()

    expect(response.status).toBe(404)
  })

  it('keeps a slot open when it has an active booking', async () => {
    signedInAs('owner-1')
    rpcFails({ code: '55006', message: 'SLOT_HAS_ACTIVE_BOOKING' })

    const response = await callDelete()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('คำขอจอง')
  })

  it('reports an already closed slot as 409', async () => {
    signedInAs('owner-1')
    rpcFails({ code: '55000', message: 'SLOT_NOT_OPEN' })

    const response = await callDelete()

    expect(response.status).toBe(409)
  })

  it('returns 503 with the migration name when the rpc is missing', async () => {
    signedInAs('owner-1')
    rpcFails({
      code: 'PGRST202',
      message: 'Could not find the function public.close_venue_slot_safely(p_slot_id)',
    })

    const response = await callDelete()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toContain('SQL38')
  })

  it('returns 503 when postgres reports the function does not exist', async () => {
    signedInAs('owner-1')
    rpcFails({ code: '42883', message: 'function public.close_venue_slot_safely(uuid) does not exist' })

    const response = await callDelete()

    expect(response.status).toBe(503)
  })

  it('falls back to 400 for an unexpected database error', async () => {
    signedInAs('owner-1')
    rpcFails({ code: 'XX000', message: 'internal error' })

    const response = await callDelete()

    expect(response.status).toBe(400)
  })

  it('still maps a known token when the driver reports no error code', async () => {
    signedInAs('owner-1')
    rpcFails({ message: 'SLOT_HAS_ACTIVE_BOOKING' })

    const response = await callDelete()

    expect(response.status).toBe(409)
  })
})
