import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  is: vi.fn(),
  select: vi.fn(),
}))

const queryBuilder = vi.hoisted(() => ({}) as Record<string, unknown>)

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: boundary.getUser },
    from: () => queryBuilder,
  }),
}))

import { PATCH } from '@/app/api/notifications/[id]/route'
import { POST } from '@/app/api/notifications/read-all/route'

const NOTIFICATION_ID = '2b7d4e81-55aa-4c33-9f01-6d7e8a9b0c12'

const patchRequest = () =>
  new Request(`http://localhost/api/notifications/${NOTIFICATION_ID}`, { method: 'PATCH' })

describe('PATCH /api/notifications/:id', () => {
  beforeEach(() => {
    boundary.getUser.mockReset()
    boundary.update.mockReset()
    queryBuilder.update = boundary.update
  })

  const resolvesWith = (result: { error: { code?: string; message: string } | null }) => {
    boundary.update.mockReturnValue({ eq: () => ({ eq: () => Promise.resolve(result) }) })
  }

  it('requires a signed-in user', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })

    const response = await PATCH(patchRequest(), { params: { id: NOTIFICATION_ID } })

    expect(response.status).toBe(401)
    expect(boundary.update).not.toHaveBeenCalled()
  })

  it('rejects an id that is not a uuid without touching the database', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })

    const response = await PATCH(patchRequest(), { params: { id: 'not-a-uuid' } })

    expect(response.status).toBe(400)
    expect(boundary.update).not.toHaveBeenCalled()
  })

  it('writes only read_at, never any other column', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    resolvesWith({ error: null })

    const response = await PATCH(patchRequest(), { params: { id: NOTIFICATION_ID } })

    expect(response.status).toBe(200)
    const payload = boundary.update.mock.calls[0][0]
    expect(Object.keys(payload)).toEqual(['read_at'])
  })

  it('returns a setup response when the notifications table is missing', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    resolvesWith({ error: { code: '42P01', message: 'relation "notifications" does not exist' } })

    const response = await PATCH(patchRequest(), { params: { id: NOTIFICATION_ID } })
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.migration).toBe('sql/17-notifications-v1.sql')
  })

  it('surfaces a revoked column grant as a permission error', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    resolvesWith({ error: { code: '42501', message: 'permission denied for table notifications' } })

    const response = await PATCH(patchRequest(), { params: { id: NOTIFICATION_ID } })

    expect(response.status).toBe(403)
  })
})

describe('POST /api/notifications/read-all', () => {
  beforeEach(() => {
    boundary.getUser.mockReset()
    boundary.update.mockReset()
    queryBuilder.update = boundary.update
  })

  it('requires a signed-in user', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })

    const response = await POST()

    expect(response.status).toBe(401)
    expect(boundary.update).not.toHaveBeenCalled()
  })

  it('marks only the caller unread rows and only the read_at column', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    boundary.update.mockReturnValue({ eq: () => ({ is: () => Promise.resolve({ error: null }) }) })

    const response = await POST()

    expect(response.status).toBe(200)
    expect(Object.keys(boundary.update.mock.calls[0][0])).toEqual(['read_at'])
  })
})
