import type { VenuePhoto } from '@/lib/venue-images'

// A visitor's signed URL is short-lived on purpose. Supabase cannot revoke one before it
// expires and Smart CDN may serve a cached response past that point
// (docs/research/venue-photo-public-delivery-2026-09-17.md), so approved photos are
// delivered through a narrow window rather than a stable public URL.
export const VENUE_PHOTO_PUBLIC_TTL_SECONDS = 120

export const VENUE_PHOTO_PUBLIC_MIGRATION = 'sql/45-venue-photo-public-delivery-v1.sql'

export type PublicPhotoRow = {
  id: string
  venue_id: string
  moderation_status: string
  caption: string | null
  sort_order: number
  is_cover: boolean
}

// What the server hands the browser: an id and its alt text. The object path stays on the
// server so the client can never ask Storage for a path of its own choosing.
export type ListedPhoto = { id: string; alt: string | null }

export type ResolvedUrls = Record<string, string | null | undefined>

export function publicGalleryPhotos(rows: PublicPhotoRow[] | null | undefined): ListedPhoto[] {
  return (rows ?? [])
    // Moderation is the gate. A pending or hidden photo never reaches a visitor, not even
    // as the cover it was uploaded to be.
    .filter(row => row.moderation_status === 'visible')
    .sort((a, b) => Number(b.is_cover) - Number(a.is_cover) || a.sort_order - b.sort_order)
    .map(row => ({ id: row.id, alt: row.caption?.trim() ? row.caption.trim() : null }))
}

export function publicPhotoViewPath(venueId: string, photoId: string) {
  return `/api/venues/${encodeURIComponent(venueId)}/photos/${encodeURIComponent(photoId)}/view`
}

// The gallery renders only photos whose url has come back. A refused or pending request is
// left out entirely, so a visitor never sees a broken frame where a photo should be.
export function resolvedGalleryPhotos(listed: ListedPhoto[], urls: ResolvedUrls): VenuePhoto[] {
  return listed
    .map(photo => ({ ...photo, url: urls[photo.id] }))
    .filter((photo): photo is ListedPhoto & { url: string } => typeof photo.url === 'string' && photo.url.length > 0)
    .map(photo => ({ id: photo.id, url: photo.url, alt: photo.alt }))
}
