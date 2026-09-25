import { describe, expect, it } from 'vitest'
import {
  VENUE_PHOTO_ACCEPT,
  VENUE_PHOTO_LIMIT,
  VENUE_PHOTO_MAX_BYTES,
  buildVenuePhotoPath,
  validateVenuePhotoFile,
} from '@/lib/venue-photo-upload'

const VENUE_ID = '4f9c1d3a-7b2e-4c5f-9a10-2d6e8b4f0c31'
const file = (type: string, size: number) => ({ type, size })

describe('validateVenuePhotoFile', () => {
  it('accepts the three formats SQL43 allows on the bucket', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp']) {
      expect(validateVenuePhotoFile(file(type, 1_000_000), 0).ok).toBe(true)
    }
  })

  it('rejects a format the bucket would refuse, before anything is uploaded', () => {
    const result = validateVenuePhotoFile(file('image/gif', 1000), 0)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('JPEG')
  })

  it('rejects a file over the 5 MB bucket limit', () => {
    const result = validateVenuePhotoFile(file('image/jpeg', VENUE_PHOTO_MAX_BYTES + 1), 0)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('5 MB')
  })

  it('accepts a file exactly on the limit', () => {
    expect(validateVenuePhotoFile(file('image/jpeg', VENUE_PHOTO_MAX_BYTES), 0).ok).toBe(true)
  })

  it('refuses the ninth photo locally instead of letting the rpc raise', () => {
    const result = validateVenuePhotoFile(file('image/jpeg', 1000), VENUE_PHOTO_LIMIT)

    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toContain('8')
  })

  it('still accepts the eighth photo', () => {
    expect(validateVenuePhotoFile(file('image/jpeg', 1000), VENUE_PHOTO_LIMIT - 1).ok).toBe(true)
  })

  it('offers only the three accepted types to the file picker', () => {
    expect(VENUE_PHOTO_ACCEPT).toBe('image/jpeg,image/png,image/webp')
  })
})

describe('buildVenuePhotoPath', () => {
  const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.webp$/

  it('matches the path shape SQL43 enforces in add_venue_photo_safely', () => {
    expect(buildVenuePhotoPath(VENUE_ID, '9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f'))
      .toBe(`${VENUE_ID}/9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f.webp`)
  })

  it('always produces a .webp path, never the original extension', () => {
    expect(buildVenuePhotoPath(VENUE_ID, '9b1e2c44-5a6f-4d78-8e90-1a2b3c4d5e6f')).toMatch(PATH_RE)
  })

  it('generates a fresh id when none is supplied', () => {
    const first = buildVenuePhotoPath(VENUE_ID)
    const second = buildVenuePhotoPath(VENUE_ID)

    expect(first).toMatch(PATH_RE)
    expect(first).not.toBe(second)
  })

  it('refuses a venue id that is not a uuid so no object lands outside a venue folder', () => {
    expect(() => buildVenuePhotoPath('../other-venue')).toThrow()
    expect(() => buildVenuePhotoPath('not-a-uuid')).toThrow()
  })

  it('refuses a photo id that is not a uuid', () => {
    expect(() => buildVenuePhotoPath(VENUE_ID, '../escape')).toThrow()
  })
})
