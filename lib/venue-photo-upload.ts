// Mirrors the limits SQL43 enforces, so the browser refuses a file before it reaches
// Storage instead of letting the bucket or the rpc raise.
export const VENUE_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export const VENUE_PHOTO_ACCEPT = VENUE_PHOTO_MIME.join(',')
export const VENUE_PHOTO_MAX_BYTES = 5 * 1024 * 1024
export const VENUE_PHOTO_LIMIT = 8

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const VENUE_PHOTO_MAX_MB = VENUE_PHOTO_MAX_BYTES / (1024 * 1024)

// Why a file was refused, as a key: the page words it (venueOwner.photos.errors.<reason>).
export type VenuePhotoFileCheck = { ok: true } | { ok: false; reason: 'limit' | 'type' | 'size' }

export function validateVenuePhotoFile(file: { type: string; size: number }, currentCount: number): VenuePhotoFileCheck {
  if (currentCount >= VENUE_PHOTO_LIMIT) {
    return { ok: false, reason: 'limit' }
  }
  if (!(VENUE_PHOTO_MIME as readonly string[]).includes(file.type)) {
    return { ok: false, reason: 'type' }
  }
  if (file.size > VENUE_PHOTO_MAX_BYTES) {
    return { ok: false, reason: 'size' }
  }
  return { ok: true }
}

// add_venue_photo_safely rejects anything that is not `<venue id>/<uuid>.webp`, so the
// path is built here rather than assembled by hand at the call site. Everything is
// re-encoded to WebP before upload, which also drops the camera EXIF block.
export function buildVenuePhotoPath(venueId: string, photoId: string = crypto.randomUUID()) {
  if (!UUID_RE.test(venueId)) throw new Error('venueId must be a UUID')
  if (!UUID_RE.test(photoId)) throw new Error('photoId must be a UUID')
  return `${venueId.toLowerCase()}/${photoId.toLowerCase()}.webp`
}
