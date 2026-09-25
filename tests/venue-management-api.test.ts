import { beforeEach, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn() }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: db.getUser }, rpc: db.rpc }) }))
import { POST } from '@/app/api/venue-management/route'
import { POST as coordinate } from '@/app/api/venue-coordination/route'
beforeEach(() => { vi.clearAllMocks(); db.getUser.mockResolvedValue({ data: { user: { id: 'owner' } } }); db.rpc.mockResolvedValue({ data: [], error: null }) })
const request = (body: unknown) => new Request('http://localhost/api/venue-management', { method: 'POST', body: JSON.stringify(body) })
it('requires login before managing a venue', async () => {
  db.getUser.mockResolvedValue({ data: { user: null } })
  expect((await POST(request({}))).status).toBe(401)
  expect(db.rpc).not.toHaveBeenCalled()
})
it('rejects a different venue owner at the database boundary', async () => {
  db.rpc.mockResolvedValue({ error: { code: '42501' } })
  expect((await POST(request({ action: 'bulk_slots', id: '11111111-1111-4111-8111-111111111111', data: {} }))).status).toBe(403)
})
it('rejects arbitrary commands and accepts a booking proposal through the guarded boundary', async () => {
  const id = '11111111-1111-4111-8111-111111111111'
  expect((await coordinate(request({ action: 'make_admin', id }))).status).toBe(400)
  expect((await coordinate(request({ action: 'propose_cancel', id, data: { reason: 'Cannot attend' } }))).status).toBe(200)
})
