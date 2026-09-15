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

import { POST } from '@/app/api/venue-bookings/route'

const SLOT_ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'

const postRequest = (body: unknown) =>
  new Request('http://localhost/api/venue-bookings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const callPost = (body: unknown = { slotId: SLOT_ID, purpose: 'ซ้อมทีม U16' }) =>
  POST(postRequest(body))

const signedInAs = (id: string) =>
  supabaseBoundary.getUser.mockResolvedValue({ data: { user: { id } } })

const rpcFails = (error: { code?: string; message: string }) =>
  supabaseBoundary.rpc.mockResolvedValue({ data: null, error })

describe('POST /api/venue-bookings', () => {
  beforeEach(() => {
    supabaseBoundary.getUser.mockReset()
    supabaseBoundary.rpc.mockReset()
  })

  it('requires a signed-in user', async () => {
    supabaseBoundary.getUser.mockResolvedValue({ data: { user: null } })

    const response = await callPost()

    expect(response.status).toBe(401)
    expect(supabaseBoundary.rpc).not.toHaveBeenCalled()
  })

  it('rejects a request without a purpose before touching the database', async () => {
    signedInAs('athlete-1')

    const response = await callPost({ slotId: SLOT_ID, purpose: '   ' })

    expect(response.status).toBe(400)
    expect(supabaseBoundary.rpc).not.toHaveBeenCalled()
  })

  it('records a booking request for an open slot', async () => {
    signedInAs('athlete-1')
    supabaseBoundary.rpc.mockResolvedValue({ data: 'booking-1', error: null })

    const response = await callPost()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.bookingId).toBe('booking-1')
    expect(supabaseBoundary.rpc).toHaveBeenCalledWith('request_venue_booking_safely', {
      p_slot_id: SLOT_ID,
      p_purpose: 'ซ้อมทีม U16',
      p_note: '',
    })
  })

  it('maps a session lost inside the rpc to 401 so the client can send the user to login', async () => {
    signedInAs('athlete-1')
    rpcFails({ code: '42501', message: 'AUTH_REQUIRED' })

    const response = await callPost()

    expect(response.status).toBe(401)
  })

  it('reports a slot someone else already reserved as a conflict', async () => {
    signedInAs('athlete-1')
    rpcFails({ code: '23505', message: 'SLOT_ALREADY_REQUESTED' })

    const response = await callPost()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('มีคำขอจองแล้ว')
  })

  it('reports a slot that is no longer open as a conflict', async () => {
    signedInAs('athlete-1')
    rpcFails({ code: '22023', message: 'SLOT_UNAVAILABLE' })

    const response = await callPost()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('ไม่ว่างแล้ว')
  })

  it('returns a setup response when the booking rpc is missing', async () => {
    signedInAs('athlete-1')
    rpcFails({ code: 'PGRST202', message: 'Could not find the function public.request_venue_booking_safely' })

    const response = await callPost()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.migration).toBe('sql/23-venues-and-bookings-v1.sql')
  })

  it('falls back to 400 for an unexpected database error', async () => {
    signedInAs('athlete-1')
    rpcFails({ code: 'XX000', message: 'internal error' })

    const response = await callPost()

    expect(response.status).toBe(400)
  })
})
