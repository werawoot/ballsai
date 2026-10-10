// A team's weekly training plan (sql/72): which weekdays the team trains and, for each,
// a short list of drills with minutes and a load. A drill is one from the reviewed
// library (content/training, by id) or one the coach names. These checks mirror
// save_team_training_plan, so the screen and the API refuse what the database refuses.
import { TRAINING_PROGRAMS, say } from '@/lib/training/content'

export type Load = 1 | 2 | 3
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6
export type PlanBlock = { drill: string | null; name: string; minutes: number; load: Load }
export type PlanDay = { day: Weekday; title: string; blocks: PlanBlock[] }
export type LibraryDrill = { id: string; name: string; minutes: number; group: string }

export const DAY_LIMITS = { blocks: 8, minutes: 120, dayMinutes: 240, title: 60, name: 80 }
const DRILL_ID = /^[a-z0-9-]{1,60}$/
const DAY_MS = 24 * 60 * 60 * 1000

/** The Monday (YYYY-MM-DD) of the Bangkok week a moment falls in. */
export function weekStartOf(at: number) {
  const bangkok = new Date(at + 7 * 60 * 60 * 1000)
  const sinceMonday = (bangkok.getUTCDay() + 6) % 7
  return new Date(bangkok.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10)
}

/** The Bangkok weekday of a moment, Monday 0 to Sunday 6 (the plan's day numbers). */
export const weekdayOf = (at: number) => ((new Date(at + 7 * 60 * 60 * 1000).getUTCDay() + 6) % 7) as Weekday

/** This Bangkok week's Monday and today's weekday, for the plan screens. */
export const planToday = (at = Date.now()) => ({ thisWeek: weekStartOf(at), today: weekdayOf(at) })

export const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
export const addWeeks = (weekStart: string, weeks: number) => addDays(weekStart, weeks * 7)

const whole = (value: unknown, min: number, max: number) => typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max

/** The days as the database will store them, or null if any part would be refused. */
export function cleanPlanDays(input: unknown): PlanDay[] | null {
  if (!Array.isArray(input) || input.length > 7) return null
  const seen = new Set<number>()
  const days: PlanDay[] = []
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') return null
    const { day, title = '', blocks } = raw as Record<string, unknown>
    if (!whole(day, 0, 6) || seen.has(day as number) || typeof title !== 'string' || !Array.isArray(blocks)) return null
    if (title.trim().length > DAY_LIMITS.title || blocks.length < 1 || blocks.length > DAY_LIMITS.blocks) return null
    seen.add(day as number)
    const clean: PlanBlock[] = []
    for (const item of blocks) {
      if (!item || typeof item !== 'object') return null
      const { drill = null, name, minutes, load } = item as Record<string, unknown>
      if (typeof name !== 'string' || !name.trim() || name.trim().length > DAY_LIMITS.name) return null
      if (!whole(minutes, 1, DAY_LIMITS.minutes) || !whole(load, 1, 3)) return null
      if (drill !== null && (typeof drill !== 'string' || !DRILL_ID.test(drill))) return null
      clean.push({ drill: drill as string | null, name: name.trim(), minutes: minutes as number, load: load as Load })
    }
    if (clean.reduce((sum, item) => sum + item.minutes, 0) > DAY_LIMITS.dayMinutes) return null
    days.push({ day: day as Weekday, title: title.trim(), blocks: clean })
  }
  return days.sort((a, b) => a.day - b.day)
}

/** Training days, total minutes and the load across the week, weighted by minutes. */
export function planSummary(days: PlanDay[]) {
  const blocks = days.flatMap(day => day.blocks)
  const minutes = blocks.reduce((sum, item) => sum + item.minutes, 0)
  const load = minutes ? Math.round(blocks.reduce((sum, item) => sum + item.load * item.minutes, 0) / minutes) as Load : null
  return { days: days.length, minutes, load }
}

/** Every reviewed library drill a coach may run with the team (restricted ones never). */
export function libraryDrills(locale: string): LibraryDrill[] {
  return TRAINING_PROGRAMS.flatMap(program => program.drills
    .filter(drill => drill.access !== 'restricted')
    .map(drill => ({ id: drill.id, name: say(drill.name, locale), minutes: Math.max(1, Math.ceil(drill.seconds / 60)), group: say(program.title, locale) })))
}
