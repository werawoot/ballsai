// Licensed stock photos the light glass design (ADR-014) may show, and where each may go.
// Every file is in public/photos/ and has a row in docs/photo-credits.md (source page,
// photographer, licence); tests/stock-photos.test.ts fails a build that adds one without
// the other.
//
// Two kinds, kept apart on purpose:
// - STADIUM: atmosphere behind a page head. An empty stadium or pitch, no people.
// - BACKDROP: a heavily blurred texture behind the whole page, for the glass to show.
// - COVER_DETAILS: a close-up of a thing (a ball on grass, a goal net, a trophy) for a
//   tournament card that has no photo of its own. Never a pitch or a stadium: a card must
//   not pass a stock place off as the tournament's venue (lib/tournament-cover.ts).
// Neither ever shows an identifiable person, a child, or a club or brand logo.

export type StockPhoto = { src: string; credit: string }

export const STADIUM: StockPhoto | null = { src: '/photos/stadium-aerial-night.webp', credit: 'Unsplash, photo-1556056504-5c7696c4c28d' }

// Behind the whole page, so glass cards have grass to show through: the same grass close-up
// as a cover, blurred until no line or place can be made out.
export const BACKDROP: StockPhoto | null = { src: '/photos/backdrop-grass-blur.webp', credit: 'Sandro Schuh, Unsplash, photo-1459865264687-595d652de67e (blurred)' }

// Close crops of pitch markings and grass: lines, a circle, an arc. No goal, stand or
// sign that could tell one ground from another.
export const COVER_DETAILS: readonly StockPhoto[] = [
  { src: '/photos/cover-grass-line.webp', credit: 'Sandro Schuh, Unsplash, photo-1459865264687-595d652de67e' },
  { src: '/photos/cover-centre-circle.webp', credit: 'Unsplash, photo-1556056504-5c7696c4c28d (crop)' },
  { src: '/photos/cover-penalty-arc.webp', credit: 'Unsplash, photo-1556056504-5c7696c4c28d (crop)' },
]

/**
 * The cover detail for one tournament: the same photo for the same tournament on every
 * visit, spread across the set so neighbouring cards differ. Null while the set is empty.
 */
export function coverDetailFor(id: string, photos: readonly StockPhoto[] = COVER_DETAILS): StockPhoto | null {
  if (photos.length === 0) return null
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return photos[hash % photos.length]
}
