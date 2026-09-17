import { describe, expect, it } from 'vitest'
import {
  publicGalleryPhotos,
  publicPhotoViewPath,
  resolvedGalleryPhotos,
  type PublicPhotoRow,
  type ResolvedUrls,
} from '@/lib/venue-photo-public'

const row = (over: Partial<PublicPhotoRow> & { id: string }): PublicPhotoRow => ({
  venue_id: 'venue-1',
  moderation_status: 'visible',
  caption: '',
  sort_order: 0,
  is_cover: false,
  ...over,
})

describe('publicGalleryPhotos', () => {
  it('keeps only visible photos', () => {
    const photos = publicGalleryPhotos([
      row({ id: 'a', moderation_status: 'visible' }),
      row({ id: 'b', moderation_status: 'pending' }),
      row({ id: 'c', moderation_status: 'hidden' }),
    ])

    expect(photos.map(photo => photo.id)).toEqual(['a'])
  })

  it('drops everything when a venue has only unmoderated photos', () => {
    const photos = publicGalleryPhotos([
      row({ id: 'b', moderation_status: 'pending' }),
      row({ id: 'c', moderation_status: 'hidden' }),
    ])

    expect(photos).toEqual([])
  })

  it('puts the cover first, then honours sort order', () => {
    const photos = publicGalleryPhotos([
      row({ id: 'c', sort_order: 2 }),
      row({ id: 'cover', sort_order: 9, is_cover: true }),
      row({ id: 'a', sort_order: 0 }),
      row({ id: 'b', sort_order: 1 }),
    ])

    expect(photos.map(photo => photo.id)).toEqual(['cover', 'a', 'b', 'c'])
  })

  it('never promotes a pending cover to the front of the gallery', () => {
    const photos = publicGalleryPhotos([
      row({ id: 'pending-cover', is_cover: true, moderation_status: 'pending' }),
      row({ id: 'visible', sort_order: 3 }),
    ])

    expect(photos.map(photo => photo.id)).toEqual(['visible'])
  })

  it('carries the caption through as alt text', () => {
    const [photo] = publicGalleryPhotos([row({ id: 'a', caption: 'หญ้าเทียมใหม่' })])

    expect(photo.alt).toBe('หญ้าเทียมใหม่')
  })

  it('leaves alt empty when there is no caption, so the gallery composes its own', () => {
    const [photo] = publicGalleryPhotos([row({ id: 'a', caption: '   ' })])

    expect(photo.alt).toBeNull()
  })

  it('tolerates a missing list', () => {
    expect(publicGalleryPhotos(null)).toEqual([])
    expect(publicGalleryPhotos(undefined)).toEqual([])
  })

  it('exposes no object path to the client', () => {
    const photos = publicGalleryPhotos([row({ id: 'a' })])

    expect(Object.keys(photos[0]).sort()).toEqual(['alt', 'id'])
  })
})

describe('publicPhotoViewPath', () => {
  it('addresses a photo by venue and photo id only', () => {
    expect(publicPhotoViewPath('venue-1', 'photo-9')).toBe('/api/venues/venue-1/photos/photo-9/view')
  })

  it('encodes ids instead of pasting them into the path', () => {
    expect(publicPhotoViewPath('a/b', 'c?d')).toBe('/api/venues/a%2Fb/photos/c%3Fd/view')
  })
})

describe('resolvedGalleryPhotos', () => {
  const listed = [{ id: 'a', alt: null }, { id: 'b', alt: 'สองประตู' }]

  it('shows only the photos whose signed url has arrived', () => {
    const urls: ResolvedUrls = { a: 'https://signed-a' }

    const photos = resolvedGalleryPhotos(listed, urls)

    expect(photos).toEqual([{ id: 'a', url: 'https://signed-a', alt: null }])
  })

  it('keeps the listed order once every url is in', () => {
    const urls: ResolvedUrls = { b: 'https://signed-b', a: 'https://signed-a' }

    expect(resolvedGalleryPhotos(listed, urls).map(photo => photo.id)).toEqual(['a', 'b'])
  })

  it('returns nothing before any url resolves, so the page shows its placeholder', () => {
    expect(resolvedGalleryPhotos(listed, {})).toEqual([])
  })

  it('skips a photo the route refused', () => {
    const urls: ResolvedUrls = { a: null, b: 'https://signed-b' }

    expect(resolvedGalleryPhotos(listed, urls).map(photo => photo.id)).toEqual(['b'])
  })
})

describe('public venue page wiring', () => {
  const read = async (path: string) => {
    const { readFileSync } = await import('node:fs')
    return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
  }

  it('selects venue photos on the server and filters them through the visible-only helper', async () => {
    const page = await read('app/venues/[id]/page.tsx')

    expect(page).toContain('venue_photos')
    expect(page).toContain('publicGalleryPhotos')
    // The page used to hardcode an empty gallery.
    expect(page).not.toContain('photos={null}')
  })

  it('asks the database only for visible photos, so an unmoderated row never reaches the client', async () => {
    const page = await read('app/venues/[id]/page.tsx')

    expect(page).toContain("'visible'")
  })

  it('never sends an object path to the browser', async () => {
    const page = await read('app/venues/[id]/page.tsx')

    expect(page).not.toContain('object_path')
    expect(page).not.toContain('createSignedUrl')
    expect(page).not.toContain('getPublicUrl')
  })

  it('resolves each url through the view route and shows loading and error states', async () => {
    const gallery = await read('app/venues/[id]/VenueGallery.tsx')

    expect(gallery).toContain('publicPhotoViewPath')
    expect(gallery).toContain('resolvedGalleryPhotos')
    expect(gallery).toMatch(/role="status"/)
    expect(gallery).not.toContain('getPublicUrl')
  })

  it('keeps the gallery free of any storage path handling', async () => {
    const gallery = await read('app/venues/[id]/VenueGallery.tsx')

    expect(gallery).not.toContain('venue-photos')
    expect(gallery).not.toContain('object_path')
  })
})
