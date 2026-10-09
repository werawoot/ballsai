// A coach's skill rating of an athlete (sql/69): five numbers, each a whole number 0-99
// or null (not assessed). It becomes a coach_verified assessment on the card only when
// the athlete accepts it, the rule SQL47 set for anything labelled coach verified.

export const COACH_SKILL_KEYS = ['speed', 'stamina', 'strength', 'technique', 'vision'] as const
export type CoachSkillKey = (typeof COACH_SKILL_KEYS)[number]
export type CoachSkills = Record<CoachSkillKey, number | null>
export type ProposalStatus = 'pending' | 'accepted' | 'declined'
export type ProposalRow = { athlete_id: string; status: string; created_at: string } & Partial<Record<CoachSkillKey, number | null>>

export function parseSkills(input: unknown): CoachSkills | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const entries = Object.entries(input as Record<string, unknown>)
  if (entries.some(([key]) => !(COACH_SKILL_KEYS as readonly string[]).includes(key))) return null
  const skills = Object.fromEntries(COACH_SKILL_KEYS.map(key => [key, null])) as CoachSkills
  for (const [key, value] of entries) {
    if (value === null) continue
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 99) return null
    skills[key as CoachSkillKey] = value
  }
  return COACH_SKILL_KEYS.some(key => skills[key] !== null) ? skills : null
}

export function stepSkill(value: number | null, step: number): number | null {
  if (value === null) return step > 0 ? 50 : null
  return Math.min(99, Math.max(0, value + step))
}

export function latestProposals<Row extends ProposalRow>(rows: Row[] | null | undefined): Record<string, Row> {
  const latest: Record<string, Row> = {}
  for (const row of rows ?? []) {
    const current = latest[row.athlete_id]
    if (!current || Date.parse(row.created_at) > Date.parse(current.created_at)) latest[row.athlete_id] = row
  }
  return latest
}
