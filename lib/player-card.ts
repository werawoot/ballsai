import { SKILL_KEYS } from '@/lib/skill-ratings'

// The numbers on a Player Card. AGENTS.md rule 8: a card without a player_ranks row is a
// STARTER card and shows no numbers; a ranked card shows its own, and a skill nobody has
// assessed yet stays empty (shown as a dash). Nothing here ever supplies a default.
export type PlayerCardStats = { ovr: number | null } & Record<(typeof SKILL_KEYS)[number], number | null>

const num = (input: unknown) => (typeof input === 'number' && Number.isFinite(input) ? input : null)

export function playerCardStats(rank: Partial<Record<'ovr' | (typeof SKILL_KEYS)[number], number | null>> | null): PlayerCardStats {
  return {
    ovr: num(rank?.ovr),
    ...Object.fromEntries(SKILL_KEYS.map(key => [key, num(rank?.[key])])),
  } as PlayerCardStats
}

// Where a card's numbers come from, for the chip on its face: results an organizer
// verified, a coach's check, or only what the athlete entered.
export type CardProvenance = 'performance' | 'coach' | 'self'

export function cardProvenance({ matches, verificationLevel }: { matches: number | null; verificationLevel: string | null }): CardProvenance {
  if ((matches ?? 0) > 0 || verificationLevel === 'performance_verified') return 'performance'
  if (verificationLevel === 'coach_verified') return 'coach'
  return 'self'
}

// The back of the card: this season's verified results, all from player_ratings.
export type CardSeason = { matches: number; goals: number; assists: number; mvps: number; power: number | null }

// The position on a card: the first one on record (rank row, athlete profile, account), or
// empty when the athlete has not chosen one. Never a default: an empty position shows as a
// dash and is saved as nothing.
export function cardPosition(...sources: (string | null | undefined)[]): string {
  return sources.find(source => source?.trim())?.trim() ?? ''
}

export const positionLabel = (position: string) => position || '—'
