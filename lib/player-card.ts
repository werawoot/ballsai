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
