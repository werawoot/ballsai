import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseBoundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: supabaseBoundary.getUser },
    rpc: supabaseBoundary.rpc,
    from: supabaseBoundary.from,
  }),
}))

import { DELETE, PATCH } from '@/app/api/venue-bookings/[bookingId]/route'

const BOOKING_ID = '489674cf-19d6-4c26-97d3-82b34c45f9da'

const patchRequest = (status: 'confirmed' | 'declined' = 'confirmed') =>
  new Request(`http://localhost/api/venue-bookings/${BOOKING_ID}`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
    headers: { 'Content-Type': 'application/json' },
  })

describe('PATCH /api/venue-bookings/:bookingId', () => {
  beforeEach(() => {
    supabaseBoundary.getUser.mockReset()
    supabaseBoundary.rpc.mockReset()
    supabaseBoundary.from.mockReset()
    supabaseBoundary.getUser.mockResolvedValue({ data: { user: { id: 'venue-owner-1' } } })
  })

  it('treats an already-confirmed response as successful after a duplicate confirm', async () => {
    supabaseBoundary.rpc.mockResolvedValue({
      error: { code: '22023', message: 'BOOKING_NOT_PENDING' },
    })
    supabaseBoundary.from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'confirmed' }, error: null }) }) }),
    })

    const response = await PATCH(patchRequest(), { params: { bookingId: BOOKING_ID } })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true, alreadyResponded: true })
  })

  it('rejects a response from someone who is not the venue owner', async () => {
    supabaseBoundary.rpc.mockResolvedValue({ error: { code: '42501', message: 'VENUE_OWNER_REQUIRED' } })

    const response = await PATCH(patchRequest(), { params: { bookingId: BOOKING_ID } })

    expect(response.status).toBe(403)
  })

  it('maps a session lost inside the response rpc to 401', async () => {
    supabaseBoundary.rpc.mockResolvedValue({ error: { code: '42501', message: 'AUTH_REQUIRED' } })

    const response = await PATCH(patchRequest(), { params: { bookingId: BOOKING_ID } })

    expect(response.status).toBe(401)
  })

  it('returns a setup response when the response rpc is missing', async () => {
    supabaseBoundary.rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'function not found' } })

    const response = await PATCH(patchRequest(), { params: { bookingId: BOOKING_ID } })

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ migration: 'sql/23-venues-and-bookings-v1.sql' })
  })
})

describe('DELETE /api/venue-bookings/:bookingId', () => {
  beforeEach(() => {
    supabaseBoundary.getUser.mockReset()
    supabaseBoundary.rpc.mockReset()
    supabaseBoundary.from.mockReset()
    supabaseBoundary.getUser.mockResolvedValue({ data: { user: { id: 'requester-1' } } })
  })

  it('reports a booking that can no longer be cancelled as a conflict', async () => {
    supabaseBoundary.rpc.mockResolvedValue({ error: { code: '22023', message: 'BOOKING_NOT_CANCELLABLE' } })

    const response = await DELETE(new Request(`http://localhost/api/venue-bookings/${BOOKING_ID}`, { method: 'DELETE' }), { params: { bookingId: BOOKING_ID } })

    expect(response.status).toBe(409)
  })

  it('maps a session lost inside the cancellation rpc to 401', async () => {
    supabaseBoundary.rpc.mockResolvedValue({ error: { code: '42501', message: 'AUTH_REQUIRED' } })

    const response = await DELETE(new Request(`http://localhost/api/venue-bookings/${BOOKING_ID}`, { method: 'DELETE' }), { params: { bookingId: BOOKING_ID } })

    expect(response.status).toBe(401)
  })
})
