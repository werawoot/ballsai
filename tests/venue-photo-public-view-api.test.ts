import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const boundary = vi.hoisted(() => ({
  photo: vi.fn(),
  venue: vi.fn(),
  createSignedUrl: vi.fn(),
  getUser: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  signedArgs: [] as unknown[][],
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: boundary.getUser },
    from: (table: string) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: () => (table === 'venue_photos' ? boundary.photo() : boundary.venue()),
      }
      return { ...chain, insert: boundary.insert, update: boundary.update }
    },
    storage: {
      from: (bucket: string) => ({
        createSignedUrl: (...args: unknown[]) => {
          boundary.signedArgs.push([bucket, ...args])
          return boundary.createSignedUrl(...args)
        },
      }),
    },
  }),
}))

import { GET } from '@/app/api/venues/[venueId]/photos/[photoId]/view/route'
import { VENUE_PHOTO_PUBLIC_TTL_SECONDS } from '@/lib/venue-photo-public'

const VENUE_ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const PHOTO_ID = '9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f'
const OBJECT_PATH = `${VENUE_ID}/${PHOTO_ID}.webp`
const SIGNED = 'https://project.supabase.co/storage/v1/object/sign/venue-photos/x?token=abc'

const call = (venueId = VENUE_ID, photoId = PHOTO_ID) =>
  GET(new Request('http://localhost/x'), { params: { venueId, photoId } })

const photoIs = (status: string, venueId = VENUE_ID) =>
  boundary.photo.mockResolvedValue({
    data: { id: PHOTO_ID, venue_id: venueId, object_path: OBJECT_PATH, moderation_status: status, caption: 'ภาพหญ้าเทียม' },
    error: null,
  })
const venuePublished = (isPublished: boolean) =>
  boundary.venue.mockResolvedValue({ data: { id: VENUE_ID, is_published: isPublished }, error: null })
const signOk = () => boundary.createSignedUrl.mockResolvedValue({ data: { signedUrl: SIGNED }, error: null })

beforeEach(() => {
  boundary.photo.mockReset(); boundary.venue.mockReset(); boundary.createSignedUrl.mockReset()
  boundary.getUser.mockReset(); boundary.insert.mockReset(); boundary.update.mockReset()
  boundary.signedArgs.length = 0
  boundary.getUser.mockResolvedValue({ data: { user: null } })
})

describe('GET /api/venues/:venueId/photos/:photoId/view', () => {
  it('gives a guest a signed url for a visible photo of a published venue', async () => {
    photoIs('visible'); venuePublished(true); signOk()

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.url).toBe(SIGNED)
    expect(body.expiresIn).toBe(VENUE_PHOTO_PUBLIC_TTL_SECONDS)
  })

  it('does not require a session, so the public gallery works signed out', async () => {
    photoIs('visible'); venuePublished(true); signOk()

    expect((await call()).status).toBe(200)
    expect(boundary.getUser).not.toHaveBeenCalled()
  })

  it('refuses a pending photo', async () => {
    photoIs('pending'); venuePublished(true); signOk()

    const response = await call()

    expect(response.status).toBe(404)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('refuses a hidden photo', async () => {
    photoIs('hidden'); venuePublished(true); signOk()

    const response = await call()

    expect(response.status).toBe(404)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('refuses a visible photo whose venue is not published', async () => {
    photoIs('visible'); venuePublished(false); signOk()

    const response = await call()

    expect(response.status).toBe(404)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('refuses a photo addressed through another venue id', async () => {
    photoIs('visible', '11111111-2222-3333-4444-555555555555'); venuePublished(true); signOk()

    const response = await call()

    expect(response.status).toBe(404)
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('rejects ids that are not uuids before touching the database', async () => {
    expect((await call('nope', PHOTO_ID)).status).toBe(400)
    expect((await call(VENUE_ID, '../../etc/passwd')).status).toBe(400)
    expect(boundary.photo).not.toHaveBeenCalled()
    expect(boundary.createSignedUrl).not.toHaveBeenCalled()
  })

  it('signs only the stored object path and never a path from the request', async () => {
    photoIs('visible'); venuePublished(true); signOk()

    await call()

    expect(boundary.signedArgs).toHaveLength(1)
    expect(boundary.signedArgs[0]).toEqual(['venue-photos', OBJECT_PATH, VENUE_PHOTO_PUBLIC_TTL_SECONDS])
  })

  it('keeps the public url deliberately short-lived', async () => {
    expect(VENUE_PHOTO_PUBLIC_TTL_SECONDS).toBeGreaterThan(0)
    expect(VENUE_PHOTO_PUBLIC_TTL_SECONDS).toBeLessThanOrEqual(300)
  })

  it('never writes the signed url back to the database', async () => {
    photoIs('visible'); venuePublished(true); signOk()

    await call()

    expect(boundary.insert).not.toHaveBeenCalled()
    expect(boundary.update).not.toHaveBeenCalled()
  })

  it('does not let a proxy cache the signed url', async () => {
    photoIs('visible'); venuePublished(true); signOk()

    expect((await call()).headers.get('cache-control')).toContain('no-store')
  })

  it('returns the caption so the gallery can use it as alt text', async () => {
    photoIs('visible'); venuePublished(true); signOk()

    expect((await call()).json().then(body => body.alt)).resolves.toBe('ภาพหญ้าเทียม')
  })

  it('treats a storage refusal as not found rather than leaking the reason', async () => {
    photoIs('visible'); venuePublished(true)
    boundary.createSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })

    expect((await call()).status).toBe(404)
  })

  it('reports a setup response when the public delivery policy is missing', async () => {
    boundary.photo.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation "venue_photos" does not exist' } })

    const response = await call()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.migration).toContain('45-venue-photo-public-delivery')
  })
})

describe('public view route source', () => {
  const source = () =>
    readFileSync(new URL('../app/api/venues/[venueId]/photos/[photoId]/view/route.ts', import.meta.url), 'utf8')

  it('never reaches for a public url or a service role', () => {
    expect(source()).not.toContain('getPublicUrl')
    expect(source()).not.toContain('service_role')
    expect(source()).not.toContain('SERVICE_ROLE')
    expect(source()).toContain('createSignedUrl')
  })

  it('reads the object path from the record, never from the request', () => {
    const text = source()
    expect(text).toContain('photo.object_path')
    expect(text).not.toMatch(/params\.(path|objectPath)/)
    expect(text).not.toContain('searchParams.get')
  })
})
