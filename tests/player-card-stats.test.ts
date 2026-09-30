import { describe, expect, it } from 'vitest'
import { cardProvenance, playerCardStats } from '@/lib/player-card'

// AGENTS.md rule 8: never present a default value as performance. /card used to give an
// athlete without a player_ranks row the numbers 65/66/62/64/65/55 under a STARTER label.
// A starter card now shows every number as not assessed.

describe('Player Card numbers', () => {
  it('a starter card (no rank row) shows no numbers at all', () => {
    expect(playerCardStats(null)).toEqual({ ovr: null, pac: null, sho: null, pas: null, dri: null, def: null })
  })

  it('a ranked card shows its own numbers, and leaves unassessed skills empty', () => {
    expect(playerCardStats({ ovr: 71, pac: 80, sho: null, pas: 64, dri: 70, def: null }))
      .toEqual({ ovr: 71, pac: 80, sho: null, pas: 64, dri: 70, def: null })
  })

  it('never invents a number for a missing or broken value', () => {
    expect(playerCardStats({ ovr: undefined as never, pac: Number.NaN, sho: 60, pas: null, dri: null, def: null }))
      .toEqual({ ovr: null, pac: null, sho: 60, pas: null, dri: null, def: null })
  })
})

// The chip on the card says where its numbers come from (AGENTS.md rule 8): verified
// match results, a coach's check, or only what the athlete typed.
describe('Player Card provenance', () => {
  it('verified matches win, then a coach check, then self', () => {
    expect(cardProvenance({ matches: 3, verificationLevel: 'self' })).toBe('performance')
    expect(cardProvenance({ matches: 0, verificationLevel: 'performance_verified' })).toBe('performance')
    expect(cardProvenance({ matches: 0, verificationLevel: 'coach_verified' })).toBe('coach')
    expect(cardProvenance({ matches: null, verificationLevel: null })).toBe('self')
    expect(cardProvenance({ matches: 0, verificationLevel: 'self' })).toBe('self')
  })
})
