import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: boundary.getUser },
    rpc: boundary.rpc,
  }),
}))

import { POST } from '@/app/api/admin/venue-photos/[photoId]/moderate/route'

const PHOTO_ID = '9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f'

const request = (body: unknown) => new Request('http://localhost/x', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

const call = (body: unknown, photoId = PHOTO_ID) =>
  POST(request(body), { params: { photoId } })

beforeEach(() => {
  boundary.getUser.mockReset()
  boundary.rpc.mockReset()
})

describe('POST /api/admin/venue-photos/:photoId/moderate', () => {
  it('requires a signed-in user before calling the moderation rpc', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })

    expect((await call({ status: 'visible' })).status).toBe(401)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('rejects malformed photo ids and unsupported statuses before touching the database', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })

    expect((await call({ status: 'visible' }, 'not-a-uuid')).status).toBe(400)
    expect((await call({ status: 'pending' })).status).toBe(400)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('approves a pending photo through the guarded SQL43 rpc', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    boundary.rpc.mockResolvedValue({ data: null, error: null })

    expect((await call({ status: 'visible' })).status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('moderate_venue_photo_safely', {
      p_photo_id: PHOTO_ID,
      p_status: 'visible',
    })
  })

  it('can hide a photo through the same guarded rpc', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
    boundary.rpc.mockResolvedValue({ data: null, error: null })

    expect((await call({ status: 'hidden' })).status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('moderate_venue_photo_safely', {
      p_photo_id: PHOTO_ID,
      p_status: 'hidden',
    })
  })

  it('does not claim success when SQL43 refuses a non-admin', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'not-admin' } } })
    boundary.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'ADMIN_REQUIRED' } })

    expect((await call({ status: 'visible' })).status).toBe(403)
  })
})
