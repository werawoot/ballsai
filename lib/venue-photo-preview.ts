// A signed URL is a boundary, not a revocation system: Supabase keeps it valid until it
// expires and the CDN may serve a cached response past that point
// (docs/research/venue-photos-supabase.md). Keep the window small and never persist one.
export const VENUE_PHOTO_PREVIEW_TTL_SECONDS = 60

export type VenuePhotoPreview = {
  url: string
  expiresIn: number
}

export type PreviewState =
  | { status: 'loading' }
  | { status: 'ready'; url: string; expiresAt: number }
  // message is the server's own reason when it gave one; the page words the rest.
  | { status: 'error'; message?: string }

export type PreviewResponse =
  | { ok: true; url: string; expiresIn: number }
  | { ok: false; error?: string }

// Stop asking a second before the signed URL dies, so the browser never requests an
// image with a URL that expired in flight.
const EXPIRY_SAFETY_MS = 3_000

export function shouldFetchPreview(state: PreviewState | undefined, now: number) {
  if (!state) return true
  if (state.status === 'loading') return false
  // An error is not retried on its own: a 403 would otherwise become a request loop.
  if (state.status === 'error') return false
  return now >= state.expiresAt
}

export function nextPreviewState(response: PreviewResponse, now: number): PreviewState {
  if (!response.ok) {
    return response.error ? { status: 'error', message: response.error } : { status: 'error' }
  }
  return {
    status: 'ready',
    url: response.url,
    expiresAt: now + Math.max(0, response.expiresIn * 1000 - EXPIRY_SAFETY_MS),
  }
}

// The wording comes from the caller, which has the translator; this keeps the rule that
// photos are numbered from 1 and a cover says it is the cover.
export function previewAltText(
  venueName: string,
  index: number,
  isCover: boolean,
  words: { cover: (name: string) => string; numbered: (name: string, number: number) => string },
) {
  return isCover ? words.cover(venueName) : words.numbered(venueName, index + 1)
}

// shouldFetchPreview only reports that a url has lapsed; nothing re-renders at that
// moment, so a page left open kept an expired url. These two arm a timer for the
// soonest expiry instead. Errors are deliberately excluded: a refused preview must not
// become a retry loop.
export function nextPreviewRefreshDelay(previews: Record<string, PreviewState>, now: number) {
  const expiries = Object.values(previews)
    .filter((state): state is Extract<PreviewState, { status: 'ready' }> => state.status === 'ready')
    .map(state => state.expiresAt)

  if (expiries.length === 0) return null
  return Math.max(0, Math.min(...expiries) - now)
}

export function schedulePreviewRefresh(previews: Record<string, PreviewState>, onDue: () => void) {
  const delay = nextPreviewRefreshDelay(previews, Date.now())
  if (delay === null) return () => {}

  const timer = setTimeout(onDue, delay)
  return () => clearTimeout(timer)
}
