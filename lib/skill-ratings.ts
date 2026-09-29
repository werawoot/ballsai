// T32. PAC, SHO, PAS, DRI and DEF on a player_ranks row are a coach's or admin's
// assessment. A row created by an athlete's first verified match (sql/61) leaves them
// empty; every page shows that as not assessed, never as a number.

export const SKILL_KEYS = ['pac', 'sho', 'pas', 'dri', 'def'] as const
export type SkillKey = (typeof SKILL_KEYS)[number]
export type SkillRow = Partial<Record<SkillKey, number | null>>
export const SKILL_NOT_ASSESSED = '—'

const value = (input: unknown): number | null => (typeof input === 'number' && Number.isFinite(input) ? input : null)

export const skillEntries = (row: SkillRow): [string, number | null][] =>
  SKILL_KEYS.map(key => [key.toUpperCase(), value(row[key])])

export const skillText = (input: unknown) => {
  const skill = value(input)
  return skill === null ? SKILL_NOT_ASSESSED : String(skill)
}

export const hasAssessedSkills = (row: SkillRow) => SKILL_KEYS.every(key => value(row[key]) !== null)
