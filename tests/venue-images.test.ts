import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  activeVenuePhoto,
  venueImageView,
  venuePhotoAlt,
  type VenuePhoto,
} from '@/lib/venue-images'

const photo = (id: string): VenuePhoto => ({ id, url: `/storage/${id}.webp` })

describe('venueImageView — no photos', () => {
  it('asks for the designed placeholder when a venue has no photo yet', () => {
    const view = venueImageView([])

    expect(view.kind).toBe('placeholder')
    expect(view.kind === 'placeholder' && view.reason).toBe('no-photos')
  })

  it('treats a missing or null photo list as no photos rather than crashing', () => {
    expect(venueImageView(null).kind).toBe('placeholder')
    expect(venueImageView(undefined).kind).toBe('placeholder')
  })
})

describe('venueImageView — the first photo is the cover', () => {
  it('uses the first photo as the cover and the rest as the gallery', () => {
    const view = venueImageView([photo('a'), photo('b'), photo('c')])

    expect(view.kind).toBe('photos')
    if (view.kind !== 'photos') return
    expect(view.cover.id).toBe('a')
    expect(view.gallery.map(item => item.id)).toEqual(['b', 'c'])
  })

  it('gives a single photo an empty gallery instead of repeating the cover', () => {
    const view = venueImageView([photo('only')])

    expect(view.kind === 'photos' && view.cover.id).toBe('only')
    expect(view.kind === 'photos' && view.gallery).toEqual([])
  })
})

describe('venueImageView — broken photos', () => {
  it('promotes the next good photo when the cover fails to load', () => {
    const view = venueImageView([photo('broken'), photo('good'), photo('also-good')], ['broken'])

    expect(view.kind).toBe('photos')
    if (view.kind !== 'photos') return
    expect(view.cover.id).toBe('good')
    expect(view.gallery.map(item => item.id)).toEqual(['also-good'])
  })

  it('drops a broken photo from the middle of the gallery', () => {
    const view = venueImageView([photo('a'), photo('bad'), photo('c')], ['bad'])

    expect(view.kind === 'photos' && view.gallery.map(item => item.id)).toEqual(['c'])
  })

  it('falls back to the placeholder when every photo is broken', () => {
    const view = venueImageView([photo('a'), photo('b')], ['a', 'b'])

    expect(view.kind).toBe('placeholder')
    expect(view.kind === 'placeholder' && view.reason).toBe('all-broken')
  })

  it('distinguishes all-broken from never-had-photos so the copy can differ', () => {
    const broken = venueImageView([photo('a')], ['a'])
    const empty = venueImageView([])

    expect(broken.kind === 'placeholder' && broken.reason).not.toBe(
      empty.kind === 'placeholder' && empty.reason,
    )
  })
})

describe('venuePhotoAlt', () => {
  it('writes Thai alt text naming the venue', () => {
    const alt = venuePhotoAlt('สนามบอลลุงหมี', 0)

    expect(alt).toContain('สนามบอลลุงหมี')
    expect(alt).toMatch(/[ก-๙]/)
  })

  it('numbers gallery photos so each alt is distinct', () => {
    expect(venuePhotoAlt('สนาม A', 1)).not.toBe(venuePhotoAlt('สนาม A', 2))
  })

  it('prefers a caption the owner supplied over the generated text', () => {
    expect(venuePhotoAlt('สนาม A', 0, 'หญ้าเทียมใหม่ ไฟสปอตไลท์ครบ')).toBe('หญ้าเทียมใหม่ ไฟสปอตไลท์ครบ')
  })

  it('ignores a blank caption instead of rendering an empty alt', () => {
    expect(venuePhotoAlt('สนาม A', 0, '   ')).toContain('สนาม A')
  })
})

describe('activeVenuePhoto', () => {
  const view = venueImageView([photo('a'), photo('b'), photo('c')])

  it('defaults to the cover at index 0 when nothing has been picked', () => {
    const active = activeVenuePhoto(view, null)

    expect(active.photo.id).toBe('a')
    expect(active.index).toBe(0)
  })

  it('reports the index of the photo the viewer actually picked', () => {
    // Regression: the hero image used to announce index 0 whatever was on screen, so a
    // screen reader user could not tell which photo they had selected.
    expect(activeVenuePhoto(view, 'b').index).toBe(1)
    expect(activeVenuePhoto(view, 'c').index).toBe(2)
  })

  it('keeps the photo and its index in step', () => {
    const active = activeVenuePhoto(view, 'c')

    expect(active.photo.id).toBe('c')
    expect(active.index).toBe(2)
  })

  it('falls back to the cover when the picked id is no longer in the view', () => {
    // A photo can drop out mid-session once it fails to load.
    const active = activeVenuePhoto(view, 'deleted')

    expect(active.photo.id).toBe('a')
    expect(active.index).toBe(0)
  })

  it('renumbers after a broken photo is dropped instead of leaving a gap', () => {
    const afterFailure = venueImageView([photo('a'), photo('b'), photo('c')], ['a'])
    const active = activeVenuePhoto(afterFailure, 'c')

    expect(active.photo.id).toBe('c')
    expect(active.index).toBe(1)
  })

  it('produces a distinct alt for the hero once a later photo is selected', () => {
    const first = activeVenuePhoto(view, 'a')
    const third = activeVenuePhoto(view, 'c')

    expect(venuePhotoAlt('สนาม A', first.index, first.photo.alt))
      .not.toBe(venuePhotoAlt('สนาม A', third.index, third.photo.alt))
  })
})

describe('VenueGallery wiring', () => {
  const source = readFileSync(
    new URL('../app/venues/[id]/VenueGallery.tsx', import.meta.url),
    'utf8',
  )

  it('gives the hero image the alt of the selected photo, not a hard-coded index', () => {
    expect(source).not.toContain('venuePhotoAlt(venueName, 0, active.alt)')
    expect(source).toContain('activeVenuePhoto(')
  })

  // A thumbnail button already carries the accessible name via aria-label. Repeating it
  // on the image inside makes a screen reader announce the photo twice per thumbnail.
  const thumbnailBlock = source.slice(source.indexOf('{view.gallery.length > 0'))

  it('keeps the accessible name on the thumbnail button', () => {
    expect(thumbnailBlock).toContain('aria-label={`ดู${venuePhotoAlt(venueName, index, item.alt)}`}')
  })

  it('marks the image inside a labelled thumbnail as decorative', () => {
    expect(thumbnailBlock).toContain('alt=""')
    expect(thumbnailBlock).not.toContain('alt={venuePhotoAlt(venueName, index, item.alt)}')
  })

  it('still announces the hero image, which has no wrapping label', () => {
    const heroBlock = source.slice(0, source.indexOf('{view.gallery.length > 0'))
    expect(heroBlock).toContain('alt={venuePhotoAlt(venueName, active.index, active.photo.alt)}')
    expect(heroBlock).not.toContain('alt=""')
  })
})
