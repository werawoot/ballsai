// Venue photos are not in the schema yet: SQL23 gives venue_profiles no image column
// and there is no venue bucket in sql/. This module is the seam the UI renders through,
// so the pages already handle covers, galleries and broken images and a later migration
// only has to supply the rows. Nothing here fetches or invents an image URL.

export type VenuePhoto = {
  id: string
  url: string
  alt?: string | null
}

export type VenueImageView =
  | { kind: 'placeholder'; reason: 'no-photos' | 'all-broken' }
  | { kind: 'photos'; cover: VenuePhoto; gallery: VenuePhoto[] }

export function venueImageView(
  photos: VenuePhoto[] | null | undefined,
  failedIds: string[] = [],
): VenueImageView {
  const all = photos ?? []
  if (all.length === 0) return { kind: 'placeholder', reason: 'no-photos' }

  const failed = new Set(failedIds)
  const usable = all.filter(item => !failed.has(item.id))
  // Every photo failed to load: say so separately from a venue that never had one, so
  // the owner sees "images could not load" and a visitor sees "no photos yet".
  if (usable.length === 0) return { kind: 'placeholder', reason: 'all-broken' }

  const [cover, ...gallery] = usable
  return { kind: 'photos', cover, gallery }
}

export function venuePhotoAlt(venueName: string, index: number, caption?: string | null) {
  const supplied = caption?.trim()
  if (supplied) return supplied
  return index === 0
    ? `ภาพสนาม ${venueName}`
    : `ภาพสนาม ${venueName} รูปที่ ${index + 1}`
}

export type ActiveVenuePhoto = { photo: VenuePhoto; index: number }

// The hero has to announce the photo that is actually on screen. Returning the index
// alongside the photo keeps the alt text and the selection from drifting apart, and the
// index is taken from the usable list so it renumbers after a broken photo is dropped.
export function activeVenuePhoto(
  view: Extract<VenueImageView, { kind: 'photos' }>,
  activeId: string | null,
): ActiveVenuePhoto {
  const photos = [view.cover, ...view.gallery]
  const index = photos.findIndex(item => item.id === activeId)
  return index === -1
    ? { photo: view.cover, index: 0 }
    : { photo: photos[index], index }
}
