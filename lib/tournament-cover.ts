// What the top of a tournament card shows, decided in one place.
//
// Today it is always a brand graphic built from fields the tournament row already has:
// the venue text, the sport if the row carries one, and whether registration is open.
// It is never a photo. The users are minors, a photo of a pitch full of players would be
// a photo of children, and a generic stock pitch would pass itself off as the real venue.
//
// `tournamentCoverPhoto` is the single switch for the future: once a tournament is linked
// to a `venues` row (a `venue_id`, which does not exist yet), return that venue's approved
// public photo there and every card picks it up. Nothing else needs to change.
//
// Kept free of React so every rule here can be tested directly.

export type TournamentCoverSource = {
  location?: string | null
  status?: string | null
  /** Not a column today. Read only if a row ever carries it; never assumed. */
  sport?: unknown
}

/** A key into `tournamentCover.status` in messages/*.json; the component words it. */
export type TournamentCoverStatus = 'open' | 'closed'

/** A key into `tournamentCover.sport`. */
export type TournamentCoverSport = 'football' | 'futsal'

export type TournamentCover =
  | { kind: 'graphic'; venue: string | null; sport: TournamentCoverSport | null; status: TournamentCoverStatus | null }
  | { kind: 'photo'; src: string; venue: string | null; sport: TournamentCoverSport | null; status: TournamentCoverStatus | null }

const SPORTS: readonly TournamentCoverSport[] = ['football', 'futsal']

/**
 * The one place a real venue photo can come from. Returns null until tournaments are
 * linked to venues, so no card can show a picture that is not of its own venue.
 */
export function tournamentCoverPhoto(tournament: TournamentCoverSource): string | null {
  void tournament
  return null
}

/**
 * Only the two states the tournament API writes are named. Anything else says nothing,
 * rather than telling a family registration is open when it may not be.
 */
export function tournamentCoverStatus(status: string | null | undefined): TournamentCoverStatus | null {
  return status === 'open' || status === 'closed' ? status : null
}

export function tournamentCoverSport(sport: unknown): TournamentCoverSport | null {
  if (typeof sport !== 'string') return null
  const key = sport.trim()
  return (SPORTS as readonly string[]).includes(key) ? key as TournamentCoverSport : null
}

export function tournamentCover(tournament: TournamentCoverSource): TournamentCover {
  const venue = tournament.location?.trim() || null
  const sport = tournamentCoverSport(tournament.sport)
  const status = tournamentCoverStatus(tournament.status)
  const src = tournamentCoverPhoto(tournament)
  return src ? { kind: 'photo', src, venue, sport, status } : { kind: 'graphic', venue, sport, status }
}
