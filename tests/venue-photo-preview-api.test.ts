import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  photo: vi.fn(),
  venue: vi.fn(),
  profile: vi.fn(),
  createSignedUrl: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: boundary.getUser },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            table === 'venue_photos' ? boundary.photo()
              : table === 'venue_profiles' ? boundary.venue()
              : boundary.profile(),
        }),
      }),
      insert: boundary.insert,
      update: boundary.update,
    }),
    storage: { from: () => ({ createSignedUrl: boundary.createSignedUrl }) },
  }),
}))

import { GET } from '@/app/api/venues/[venueId]/photos/[photoId]/preview/route'
import { VENUE_PHOTO_PREVIEW_TTL_SECONDS } from '@/lib/venue-photo-preview'

const VENUE_ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const PHOTO_ID = '9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f'
const OBJECT_PATH = `${VENUE_ID}/${PHOTO_ID}.webp`
const SIGNED = 'https://project.supabase.co/storage/v1/object/sign/venue-photos/x?token=abc'

const call = (venueId = VENUE_ID, photoId = PHOTO_ID) =>
  GET(new Request('http://localhost/x'), { params: { venueId, photoId } })

const signedInAs = (id: string) => boundary.getUser.mockResolvedValue({ data: { user: { id } } })
const photoFound = (venueId = VENUE_ID) =>
  boundary.photo.mockResolvedValue({ data: { id: PHOTO_ID, venue_id: venueId, object_path: OBJECT_PATH, moderation_status: 'pending' }, error: null })
const ownedBy = (ownerId: string) => boundary.venue.mockResolvedValue({ data: { owner_id: ownerId }, error: null })
const roleIs = (role: string) => boundary.profile.mockResolvedValue({ data: { role }, error: null })
const signOk = () => boundary.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })

beforeEach(() => {
  for (const fn of Object.values(boundary)) fn.mockReset()
  roleIs('user')
})

describe('GET /api/venues/:venueId/photos/:photoId/preview', () => {
  it('lets the venue owner preview their own photo', async () => {
    signedInAs('owner-1'); photoFound(); ownedBy('owner-1'); signOk()

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toBe(SIGNED)
  })

  it('lets an admin preview any venue photo', async () => {
    signedInAs('admin-1'); photoFound(); ownedBy('someone-else'); roleIs('admin'); signOk()

    expect((await call()).status).toBe(200)
  })

  it('refuses a signed url to a user who is neither the owner nor an admin', async () => {
    signedInAs('stranger'); photoFound(); ownedBy('owner-1')

    const response = await call()

    expect(response.status).toBe(403)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('requires a signed-in user', async () => {
    boundary.getUser.mockResolvedValue({ data: { user: null } })

    expect((await call()).status).toBe(401)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('rejects ids that are not uuids before any query', async () => {
    signedInAs('owner-1')

    expect((await call('nope', PHOTO_ID)).status).toBe(400)
    expect((await call(VENUE_ID, 'nope')).status).toBe(400)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('refuses a photo that belongs to a different venue', async () => {
    signedInAs('owner-1'); photoFound('11111111-2222-3333-4444-555555555555'); ownedBy('owner-1')

    const response = await call()

    expect(response.status).toBe(404)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('reports a missing photo as 404', async () => {
    signedInAs('owner-1')
    boundary.photo.mockResolvedValue({ data: null, error: null })

    expect((await call()).status).toBe(404)
  })

  it('mints a deliberately short-lived url', async () => {
    signedInAs('owner-1'); photoFound(); ownedBy('owner-1'); signOk()

    await call()

    expect(boundary.createSignedUrl).toHaveBeenCalledWith(OBJECT_PATH, VENUE_PHOTO_PREVIEW_TTL_SECONDS)
    expect(VENUE_PHOTO_PREVIEW_TTL_SECONDS).toBeLessThanOrEqual(120)
    expect(VENUE_PHOTO_PREVIEW_TTL_SECONDS).toBeGreaterThan(0)
  })

  it('tells the caller how long the url lasts so the client can refetch', async () => {
    signedInAs('owner-1'); photoFound(); ownedBy('owner-1'); signOk()

    const body = await (await call()).json()

    expect(body.expiresIn).toBe(VENUE_PHOTO_PREVIEW_TTL_SECONDS)
  })

  it('never writes the signed url back to the database', async () => {
    signedInAs('owner-1'); photoFound(); ownedBy('owner-1'); signOk()

    await call()

    expect(boundary.insert).not.toHaveBeenCalled()
    expect(boundary.update).not.toHaveBeenCalled()
  })

  it('surfaces a storage rls refusal as a permission error, not a crash', async () => {
    signedInAs('owner-1'); photoFound(); ownedBy('owner-1')
    boundary.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })

    expect((await call()).status).toBe(403)
  })

  it('returns a setup response when SQL43 is not applied', async () => {
    signedInAs('owner-1')
    boundary.photo.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "venue_photos" does not exist' } })

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.migration).toBe('sql/43-venue-photos-v1.sql')
  })

  it('marks the response uncacheable so a short-lived url is not stored by a proxy', async () => {
    signedInAs('owner-1'); photoFound(); ownedBy('owner-1'); signOk()

    const response = await call()

    expect(response.headers.get('cache-control')).toContain('no-store')
  })
})

describe('preview route source', () => {
  it('never reaches for a public url or a service role', async () => {
    const { readFileSync } = await import('node:fs')
    const source = readFileSync(
      new URL('../app/api/venues/[venueId]/photos/[photoId]/preview/route.ts', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('getPublicUrl')
    expect(source).not.toContain('service_role')
    expect(source).not.toContain('SERVICE_ROLE')
    expect(source).toContain('createSignedUrl')
  })
})
