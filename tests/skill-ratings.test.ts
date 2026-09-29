import { describe, expect, it } from 'vitest'
import { SKILL_NOT_ASSESSED, hasAssessedSkills, skillEntries, skillText } from '@/lib/skill-ratings'

// T32: a rank row created by an athlete's first verified match has no PAC/SHO/PAS/DRI/DEF:
// those are a coach's or admin's assessment. The UI shows them as not assessed, never as
// a number (AGENTS.md rule 8: never present a default value as performance).
describe('skill ratings', () => {
  it('lists the five skills in card order, keeping empty ones empty', () => {
    expect(skillEntries({ pac: 80, sho: null, pas: 70, dri: undefined, def: 0 })).toEqual([
      ['PAC', 80], ['SHO', null], ['PAS', 70], ['DRI', null], ['DEF', 0],
    ])
  })

  it('prints a missing skill as a dash, and 0 as 0', () => {
    expect(skillText(null)).toBe(SKILL_NOT_ASSESSED)
    expect(skillText(undefined)).toBe(SKILL_NOT_ASSESSED)
    expect(skillText(Number.NaN)).toBe(SKILL_NOT_ASSESSED)
    expect(skillText(0)).toBe('0')
    expect(skillText(73)).toBe('73')
  })

  it('counts a player as assessed only when every skill has a value', () => {
    expect(hasAssessedSkills({ pac: 1, sho: 2, pas: 3, dri: 4, def: 5 })).toBe(true)
    expect(hasAssessedSkills({ pac: 1, sho: 2, pas: 3, dri: 4, def: null })).toBe(false)
    expect(hasAssessedSkills({})).toBe(false)
  })
})
