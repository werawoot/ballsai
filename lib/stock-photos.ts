// Licensed stock photos the light glass design (ADR-014) may show, and where each may go.
// Every file is in public/photos/ and has a row in docs/photo-credits.md (source page,
// photographer, licence); tests/stock-photos.test.ts fails a build that adds one without
// the other.
//
// Four kinds, kept apart on purpose:
// - STADIUM: atmosphere behind the home page head. An empty stadium or pitch, no people.
// - PAGE_PHOTOS: one different photo behind each other page's head, so no two pages look
//   the same (owner, 22 Oct 2026: "รูปอย่าพยายามใช้ซ้ำ"). Minimal details of the game:
//   seats, a net, floodlights, lines, a roof. The tournament page's own head is a net, not
//   a place, so it never passes for that tournament's venue.
// - BACKDROP: a heavily blurred texture behind the whole page, for the glass to show.
// - COVER_DETAILS: a close crop (grass and a line, a centre circle, a penalty arc) for a
//   tournament card that has no photo of its own. Never a whole pitch, a stand or a
//   stadium: a card must not pass a stock place off as the tournament's venue
//   (lib/tournament-cover.ts).
// None ever shows an identifiable person, a child, or a club or brand logo.

import type { CSSProperties } from 'react'

export type StockPhoto = { src: string; credit: string }

export const STADIUM: StockPhoto | null = { src: '/photos/stadium-aerial-night.webp', credit: 'Unsplash, photo-1556056504-5c7696c4c28d' }

const unsplash = (photographer: string, id: string) => `${photographer}, Unsplash, photo-${id}`
const pexels = (photographer: string, id: string) => `${photographer}, Pexels, photo ${id}`

export type PhotoPage = 'tournaments' | 'tournament' | 'login' | 'welcome' | 'ranking' | 'athletes' | 'hallOfFame' | 'player' | 'profile' | 'profileEdit' | 'teams' | 'join' | 'notifications' | 'matchPlan'

export const PAGE_PHOTOS: Readonly<Record<PhotoPage, StockPhoto>> = {
  tournaments: { src: '/photos/head-seats-colour.webp', credit: unsplash('Nico Smit', '1646801479598-6a00891d2039') },
  tournament: { src: '/photos/head-net-dark.webp', credit: unsplash('Sebastian Schuster', '1758934217889-1aec468a2d4d') },
  login: { src: '/photos/page-floodlights.webp', credit: unsplash('Linus Belanger', '1760800954391-c0975e57d0bf') },
  welcome: { src: '/photos/page-net-sunset.webp', credit: unsplash('Alex (alexdphotography)', '1558297462-bf13bfc9fad2') },
  ranking: { src: '/photos/head-pitch-above.webp', credit: unsplash('Bernd Dittrich', '1723231462004-069caa209740') },
  athletes: { src: '/photos/head-pitch-lines.webp', credit: unsplash('Dan Gold', '1507602368706-321eeafaf53b') },
  hallOfFame: { src: '/photos/head-seats-mono.webp', credit: unsplash('Ramiro Pianarosa', '1741899940722-8f70b3911c81') },
  player: { src: '/photos/head-roof-sky.webp', credit: unsplash('Bangkit Ristant', '1494390438231-97c51a2de9c7') },
  profile: { src: '/photos/card-pitch-overhead.webp', credit: unsplash('Victor (victor_g)', '1546717003-caee5f93a9db') },
  profileEdit: { src: '/photos/head-corner-flag.webp', credit: unsplash('Ben Wiens', '1531861184681-f2de7dd72da5') },
  teams: { src: '/photos/head-training-cones.webp', credit: pexels('Chris K', '13204961') },
  join: { src: '/photos/head-fence-sunrise.webp', credit: pexels('Alexander Mass', '29741193') },
  notifications: { src: '/photos/head-floodlight-pair.webp', credit: pexels('Toni Cuenca', '776805') },
  matchPlan: { src: '/photos/head-pitch-floodlit.webp', credit: pexels('Jonathan Petersson', '399187') },
}

// The one picture of people the site shows that no user uploaded (owner's decision, 23 Oct
// 2026; AGENTS.md rule 7): athletes the owner made with an AI image tool, no real person and
// no brand mark, beside the line on /login only. Nowhere else, and never a stand-in for an
// athlete, a team or a venue.
export const LOGIN_ART: StockPhoto = { src: '/photos/login-athletes-owner.webp', credit: 'Made by the owner with an AI image tool, 23 Oct 2026' }

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

// The style that puts a page's head photo and the blurred grass behind a glass page.
export function glassSceneStyle(head: StockPhoto | null): CSSProperties {
  return {
    ...(BACKDROP ? { '--gl-backdrop-photo': `url(${BACKDROP.src})` } : {}),
    ...(head ? { '--gl-stadium-photo': `url(${head.src})` } : {}),
  } as CSSProperties
}

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
