import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: boundary.getUser },
    rpc: boundary.rpc,
    storage: { from: () => ({ remove: boundary.remove }) },
  }),
}))

import { POST } from '@/app/api/venues/[venueId]/photos/route'
import { PATCH as REORDER } from '@/app/api/venues/[venueId]/photos/route'
import { DELETE, PATCH } from '@/app/api/venues/[venueId]/photos/[photoId]/route'

const VENUE_ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const PHOTO_ID = '9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f'
const OBJECT_PATH = `${VENUE_ID}/${PHOTO_ID}.webp`

const req = (body?: unknown) => new Request('http://localhost/x', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})

const signedIn = (id = 'owner-1') => boundary.getUser.mockResolvedValue({ data: { user: { id } } })
const rpcFails = (error: { code?: string; message: string }) =>
  boundary.rpc.mockResolvedValue({ data: null, error })

beforeEach(() => {
  boundary.getUser.mockReset()
  boundary.rpc.mockReset()
  boundary.remove.mockReset()
})

describe('POST /api/venues/:venueId/photos', () => {
  const call = (body: unknown = { objectPath: OBJECT_PATH, caption: 'หญ้าเทียมใหม่' }) =>
    POST(req(body), { params: { venueId: VENUE_ID } })

  it('requires a signed-in user', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })

    expect((await call()).status).toBe(401)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('rejects a venue id that is not a uuid before touching the database', async () => {
    signedIn()

    const response = await POST(req({ objectPath: OBJECT_PATH }), { params: { venueId: 'nope' } })

    expect(response.status).toBe(400)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('rejects an object path that does not sit inside this venue folder', async () => {
    signedIn()

    const response = await call({ objectPath: `other-venue/${PHOTO_ID}.webp` })

    expect(response.status).toBe(400)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })

  it('registers the uploaded object through the rpc', async () => {
    signedIn()
    boundary.rpc.mockResolvedValue({ data: PHOTO_ID, error: null })

    const response = await call()

    expect(response.status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('add_venue_photo_safely', {
      p_venue_id: VENUE_ID,
      p_object_path: OBJECT_PATH,
      p_caption: 'หญ้าเทียมใหม่',
    })
  })

  it('never sends a moderation status: only an admin may set one', async () => {
    signedIn()
    boundary.rpc.mockResolvedValue({ data: PHOTO_ID, error: null })

    await call({ objectPath: OBJECT_PATH, moderation_status: 'visible' })

    expect(Object.keys(boundary.rpc.mock.calls[0][1])).toEqual(['p_venue_id', 'p_object_path', 'p_caption'])
  })

  it('blocks a user who does not own the venue', async () => {
    signedIn('someone-else')
    rpcFails({ code: '42501', message: 'VENUE_OWNER_REQUIRED' })

    expect((await call()).status).toBe(403)
  })

  it('reports a full album as a conflict the owner can act on', async () => {
    signedIn()
    rpcFails({ code: '22023', message: 'VENUE_PHOTO_LIMIT_REACHED' })

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(409)
    expect(body.error).toContain('8')
  })

  it('explains that the upload did not reach storage', async () => {
    signedIn()
    rpcFails({ code: 'P0002', message: 'VENUE_PHOTO_OBJECT_NOT_FOUND' })

    const response = await call()

    expect(response.status).toBe(409)
  })

  it('returns a setup response when SQL43 is not applied', async () => {
    signedIn()
    rpcFails({ code: 'PGRST202', message: 'Could not find the function public.add_venue_photo_safely' })

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.migration).toBe('sql/43-venue-photos-v1.sql')
  })
})

describe('PATCH /api/venues/:venueId/photos (reorder)', () => {
  it('sends the whole id list to the reorder rpc', async () => {
    signedIn()
    boundary.rpc.mockResolvedValue({ data: null, error: null })

    const response = await REORDER(req({ photoIds: [PHOTO_ID, VENUE_ID] }), { params: { venueId: VENUE_ID } })

    expect(response.status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('reorder_venue_photos_safely', { p_photo_ids: [PHOTO_ID, VENUE_ID] })
  })

  it('rejects an empty or oversized list before calling the rpc', async () => {
    signedIn()

    expect((await REORDER(req({ photoIds: [] }), { params: { venueId: VENUE_ID } })).status).toBe(400)
    expect((await REORDER(req({ photoIds: Array(9).fill(PHOTO_ID) }), { params: { venueId: VENUE_ID } })).status).toBe(400)
    expect(boundary.rpc).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/venues/:venueId/photos/:photoId (cover)', () => {
  const call = () => PATCH(req({}), { params: { venueId: VENUE_ID, photoId: PHOTO_ID } })

  it('sets the cover through the rpc', async () => {
    signedIn()
    boundary.rpc.mockResolvedValue({ data: null, error: null })

    expect((await call()).status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('set_venue_photo_cover_safely', { p_photo_id: PHOTO_ID })
  })

  it('reports a photo that no longer exists as 404', async () => {
    signedIn()
    rpcFails({ code: 'P0002', message: 'VENUE_PHOTO_NOT_FOUND' })

    expect((await call()).status).toBe(404)
  })
})

describe('DELETE /api/venues/:venueId/photos/:photoId', () => {
  const call = () => DELETE(req(), { params: { venueId: VENUE_ID, photoId: PHOTO_ID } })

  it('removes the storage object only after the rpc succeeds', async () => {
    signedIn()
    boundary.rpc.mockResolvedValue({ data: OBJECT_PATH, error: null })
    boundary.remove.mockResolvedValue({ error: null })

    const response = await call()

    expect(response.status).toBe(200)
    expect(boundary.rpc).toHaveBeenCalledWith('remove_venue_photo_safely', { p_photo_id: PHOTO_ID })
    expect(boundary.remove).toHaveBeenCalledWith([OBJECT_PATH])
  })

  it('leaves the file alone when the rpc refuses', async () => {
    signedIn('someone-else')
    rpcFails({ code: '42501', message: 'VENUE_OWNER_REQUIRED' })

    const response = await call()

    expect(response.status).toBe(403)
    expect(boundary.remove).not.toHaveBeenCalled()
  })

  it('still reports success when the row is gone but the file lingers', async () => {
    // The row is what the app reads. A stranded object is an operations concern, not a
    // reason to tell the owner their delete failed and have them retry.
    signedIn()
    boundary.rpc.mockResolvedValue({ data: OBJECT_PATH, error: null })
    boundary.remove.mockResolvedValue({ error: { message: 'storage unavailable' } })

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.storageCleanupFailed).toBe(true)
  })
})
