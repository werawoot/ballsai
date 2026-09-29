import type { PlayerPosition } from '@/lib/rating'

// T32. An athlete's rank row is created by their first verified match (sql/61), not by
// an admin. Until then /dashboard/results offers them under a key that names the athlete,
// and the confirm sends them by athleteId so the database creates the row in the same
// transaction as the match.

export const NEW_PLAYER_PREFIX = 'new:'
// Where every rating starts (player_ratings.power_rating default, sql/ballsai-rating-v1).
export const FIRST_MATCH_RATING = 1000

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const POSITIONS: PlayerPosition[] = ['GK', 'DF', 'MF', 'FW']

export const newPlayerKey = (athleteId: string) => `${NEW_PLAYER_PREFIX}${athleteId}`

export function parsePlayerKey(key: unknown): { kind: 'new'; athleteId: string } | { kind: 'rank'; rankId: string } | null {
  if (typeof key !== 'string' || !key) return null
  if (!key.startsWith(NEW_PLAYER_PREFIX)) return { kind: 'rank', rankId: key }
  const athleteId = key.slice(NEW_PLAYER_PREFIX.length)
  return UUID.test(athleteId) ? { kind: 'new', athleteId: athleteId.toLowerCase() } : null
}

// The profile's position if it is one the rating understands; otherwise none, so no
// position bonus is invented for a player whose position nobody set.
export function profilePosition(value: unknown): PlayerPosition | null {
  const upper = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return (POSITIONS as string[]).includes(upper) ? (upper as PlayerPosition) : null
}

// The item recorded for one player: a new athlete travels by athleteId, anyone else by
// the rank row id they already have.
export function toRecordedPerformance<T extends { playerRankId: string }>(item: T) {
  const key = parsePlayerKey(item.playerRankId)
  if (key?.kind !== 'new') return item
  const { playerRankId: _key, ...rest } = item
  void _key
  return { ...rest, athleteId: key.athleteId }
}
