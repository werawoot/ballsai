import type { Progress } from './training/schedule'
import type { Program } from './training/content'
import { DRILL_SKILL, type Skill } from './training/skills'
import { COACH_SKILL_KEYS, type CoachSkillKey } from './coach-skills'

// The athlete's home (/profile) in the DOENSAI dashboard design (owner, 2 Nov 2026). Free of React
// and of the database, so every rule can be tested directly. Each number shown has a source:
// training counts come from the athlete's own check-ins (self-reported, SQL63) and earn no XP;
// the rating change comes from verified match results; skills only from a coach's assessment
// the athlete accepted (SQL69). Where the source is missing, nothing is shown.

export type WeeklyGoal = { done: number; planned: number; percent: number; minutes: number }

/**
 * Sessions done this week against sessions planned this week. A session made up on another day
 * of the same week counts (the rule of lib/training/schedule.ts); extra days never go past the plan.
 * Minutes are the programme's planned minutes for each session done: self-reported, not timed.
 */
export function weeklyGoal(progress: Progress, minutesPerSession = 0): WeeklyGoal | null {
  const planned = progress.thisWeek.filter(day => day.planned).length
  if (planned === 0) return null
  const done = Math.min(planned, progress.thisWeek.filter(day => day.done).length)
  return { done, planned, percent: Math.round((done / planned) * 100), minutes: done * minutesPerSession }
}

/** The Power Rating change of the last verified match; a void sets it back to 0 (sql/65). */
export function lastMatchChange(rating: { matches_played: number | null; last_rating_change: number | null } | null): number | null {
  if (!rating || !rating.matches_played || !rating.last_rating_change) return null
  return rating.last_rating_change
}

export const RADAR_MIN_SKILLS = 3
export type SkillRow = Partial<Record<CoachSkillKey, number | null>> & { source_level: string; created_at: string }
export type VerifiedSkills = { date: string; source: 'coach_verified' | 'performance_verified'; skills: [CoachSkillKey, number][] }

/** The latest assessment by a coach (or from performance), never the athlete's own. */
export function verifiedSkills(row: SkillRow | null): VerifiedSkills | null {
  if (!row || (row.source_level !== 'coach_verified' && row.source_level !== 'performance_verified')) return null
  const skills = COACH_SKILL_KEYS.flatMap(key => {
    const value = row[key]
    return typeof value === 'number' && Number.isFinite(value) ? [[key, value] as [CoachSkillKey, number]] : []
  })
  if (skills.length < RADAR_MIN_SKILLS) return null
  return { date: row.created_at, source: row.source_level, skills }
}

/** Points of a radar shape around (0, 0): the first axis straight up, clockwise, 99 on the rim. */
export function radarPoints(values: number[], radius: number): { x: number; y: number }[] {
  return values.map((value, index) => {
    const angle = (index / values.length) * Math.PI * 2 - Math.PI / 2
    const length = (Math.max(0, Math.min(99, value)) / 99) * radius
    const round = (n: number) => Math.round(n * 1000) / 1000 + 0
    return { x: round(Math.cos(angle) * length), y: round(Math.sin(angle) * length) }
  })
}

/** Monday 00:00 in Thailand (UTC+7, no daylight saving) of the week holding `today`, as UTC. */
export function bangkokWeekStart(today: string): string {
  const date = new Date(`${today}T00:00:00Z`)
  const weekday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - weekday)
  return new Date(date.getTime() - 7 * 3600_000).toISOString()
}

/** XP earned this week. The rows are athlete_xp_events, written only by verified match results. */
export function weekXp(rows: { xp_amount: number | null }[] | null | undefined): number {
  return (rows ?? []).reduce((sum, row) => sum + (typeof row.xp_amount === 'number' ? row.xp_amount : 0), 0)
}

/** Each skill a programme's drills train, once (lib/training/skills.ts). */
export function programSkills(program: Program): Skill[] {
  return [...new Set(program.drills.map(drill => DRILL_SKILL[drill.id]).filter((skill): skill is Skill => Boolean(skill)))]
}

/** Skills trained this week: the programme's skills once a session is checked in, else none. */
export function weekSkills(goal: WeeklyGoal | null, program: Program): number {
  return goal && goal.done > 0 ? programSkills(program).length : 0
}
