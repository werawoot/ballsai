import { getProgram, type Program } from './training/content'
import type { MyTraining } from './training/data'
import { sessionDates, type Progress } from './training/schedule'
import { DRILL_SKILL, type Skill } from './training/skills'
import type { TrainingTodayView } from './training/today'
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


export type WeekTotals = { done: number; planned: number; percent: number; minutes: number; skills: number }

/**
 * The week of every active programme, counted as /training "my schedule" counts it (review,
 * 3 Nov 2026): sessions done against planned per programme, added up; minutes are each
 * programme's planned minutes per session done; skills are those of the programmes trained
 * this week, each once. All of it is the athlete's own check-ins (SQL63).
 */
export function weekTotals(view: TrainingTodayView): WeekTotals | null {
  const goals = view.programs.map(item => ({ program: item.program, goal: weeklyGoal(item.progress, item.program.minutes) }))
  const planned = goals.reduce((sum, item) => sum + (item.goal?.planned ?? 0), 0)
  if (planned === 0) return null
  const done = goals.reduce((sum, item) => sum + (item.goal?.done ?? 0), 0)
  const minutes = goals.reduce((sum, item) => sum + (item.goal?.minutes ?? 0), 0)
  const skills = new Set(goals.filter(item => (item.goal?.done ?? 0) > 0).flatMap(item => programSkills(item.program)))
  return { done, planned, percent: Math.round((done / planned) * 100), minutes, skills: skills.size }
}

// --- The home of the third reference (owner, 3 Nov 2026) ----------------------------------
//
// "แต้มขยัน" (effort points, owner's choice "เอาแต้มขยัน"): 50 for each programme session the
// athlete checks in. They are worked out from training_checkins, which the database already
// holds to one per programme per day, at most 3 active programmes, back-dated 6 days at most
// (SQL63), so a repeated tap cannot add any. They are kept apart from XP: they never change
// the level, the card or a rank, and the page says they are self-reported.

export const EFFORT_PER_SESSION = 50

export type MissionItem = { programId: string; program: Program; minutes: number; done: boolean; points: number }

/** Today's missions: each programme planned today, in the order /training lists them. */
export function todayMissionList(view: TrainingTodayView): MissionItem[] {
  return view.today.map(item => ({ programId: item.program.id, program: item.program, minutes: item.program.minutes, done: item.done, points: EFFORT_PER_SESSION }))
}

export type EffortSummary = { todayEarned: number; todayPossible: number; week: number }

export function effortSummary(view: TrainingTodayView): EffortSummary {
  const week = view.programs.reduce((sum, item) => sum + (weeklyGoal(item.progress)?.done ?? 0), 0)
  return {
    todayEarned: view.doneToday * EFFORT_PER_SESSION,
    todayPossible: view.plannedToday * EFFORT_PER_SESSION,
    week: week * EFFORT_PER_SESSION,
  }
}

/** Minutes of every session done on the active programmes, at each programme's planned length. */
export function totalMinutes(view: TrainingTodayView): number {
  return view.programs.reduce((sum, item) => sum + item.progress.done * item.program.minutes, 0)
}

export type NextSession = { date: string; programId: string; program: Program }

/** The next session not done yet: one of today's first, else the soonest coming one. */
export function nextSession(view: TrainingTodayView): NextSession | null {
  const open = view.today.find(item => !item.done)
  if (open) return { date: open.progress.today ?? '', programId: open.program.id, program: open.program }
  const coming = view.programs
    .filter(item => item.progress.next && item.progress.next !== item.progress.today)
    .sort((a, b) => (a.progress.next ?? '').localeCompare(b.progress.next ?? ''))[0]
  return coming ? { date: coming.progress.next!, programId: coming.program.id, program: coming.program } : null
}

/**
 * Days in a row: planned training days that were trained, counted back from today. A day no
 * programme plans (a rest day) is skipped, never a break, so a child is not pushed to train every
 * day; today does not break the run before it is trained. Self-reported, like every check-in.
 */
export function dayStreak(training: MyTraining, today: string): number {
  const planned = new Set<string>()
  const done = new Set<string>()
  let earliest = today
  for (const enrollment of training.enrollments) {
    const program = getProgram(enrollment.program_id)
    if (!program) continue
    for (const day of sessionDates(enrollment.start_date, enrollment.weekdays, program.weeks)) planned.add(day)
    for (const day of training.checkins[enrollment.id] ?? []) done.add(day)
    if (enrollment.start_date < earliest) earliest = enrollment.start_date
  }
  let streak = 0
  const cursor = new Date(`${today}T00:00:00Z`)
  for (let step = 0; step < 400; step++) {
    const day = cursor.toISOString().slice(0, 10)
    if (day < earliest) break
    if (planned.has(day)) {
      if (done.has(day)) streak++
      else if (day !== today) break
    }
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
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
