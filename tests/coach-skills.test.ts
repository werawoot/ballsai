import { describe, expect, it } from 'vitest'
import { COACH_SKILL_KEYS, latestProposals, parseSkills, stepSkill } from '@/lib/coach-skills'

describe('a coach skill rating, checked before it reaches the database (SQL69)', () => {
  it('accepts the five skills as whole numbers 0-99 or null, and needs at least one', () => {
    expect(parseSkills({ speed: 72, stamina: null, technique: 0, vision: 99 })).toEqual({ speed: 72, stamina: null, strength: null, technique: 0, vision: 99 })
    expect(parseSkills({ speed: null })).toBeNull()
    expect(parseSkills({})).toBeNull()
  })

  it('refuses anything else', () => {
    for (const bad of [{ speed: 100 }, { speed: -1 }, { speed: 4.5 }, { speed: '70' }, { pace: 70 }, null, [], 'x']) {
      expect(parseSkills(bad)).toBeNull()
    }
  })

  it('steps a value by 5 inside 0-99; an unassessed skill starts at 50', () => {
    expect(stepSkill(null, 5)).toBe(50)
    expect(stepSkill(null, -5)).toBeNull()
    expect(stepSkill(97, 5)).toBe(99)
    expect(stepSkill(2, -5)).toBe(0)
    expect(stepSkill(60, -5)).toBe(55)
  })

  it('names the five skills in the order the card shows them', () => {
    expect(COACH_SKILL_KEYS).toEqual(['speed', 'stamina', 'strength', 'technique', 'vision'])
  })
})

describe("the newest proposal per athlete, for the coach's view", () => {
  it('keeps one per athlete, the newest', () => {
    const rows = [
      { athlete_id: 'a', status: 'declined', created_at: '2026-10-01T00:00:00Z', speed: 50 },
      { athlete_id: 'a', status: 'pending', created_at: '2026-10-05T00:00:00Z', speed: 60 },
      { athlete_id: 'b', status: 'accepted', created_at: '2026-10-02T00:00:00Z', speed: 70 },
    ]
    const latest = latestProposals(rows)
    expect(latest.a).toMatchObject({ status: 'pending', speed: 60 })
    expect(latest.b).toMatchObject({ status: 'accepted' })
  })
})
