import type { Progress } from './training/schedule'
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

export const HOME_TOURNAMENT_LIMIT = 3
type OpenRow = { id: string; status: string | null; start_date: string; end_date?: string | null }

/** Open for registration and not over yet, soonest first. */
export function openTournamentsAhead<Row extends OpenRow>(rows: Row[], today: string): Row[] {
  return rows
    .filter(row => row.status === 'open' && (row.end_date ?? row.start_date) >= today)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
    .slice(0, HOME_TOURNAMENT_LIMIT)
}
