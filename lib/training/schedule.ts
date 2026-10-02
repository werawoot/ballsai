import type { Band } from './content'

// The training timetable: which weekdays, which dates, and what counts as done.
// Rules from docs/training-flow-v1.md: at least 2 rest days a week for U10–U13 and 1 for
// U14–U17, and a streak is planned sessions kept, never consecutive days.
// Weekdays are 0 = Monday … 6 = Sunday. Dates are Thai calendar days, YYYY-MM-DD.

export const MIN_REST_DAYS: Record<Band, number> = { u10_u13: 2, u14_u17: 1 }

export type WeekdayCheck = { ok: true } | { ok: false; reason: 'count' | 'rest' | 'invalid' }

export function checkWeekdays(days: number[], { band, perWeek }: { band: Band; perWeek: number }): WeekdayCheck {
  const unique = [...new Set(days)]
  if (unique.length !== days.length || unique.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return { ok: false, reason: 'invalid' }
  if (unique.length !== perWeek) return { ok: false, reason: 'count' }
  if (7 - unique.length < MIN_REST_DAYS[band]) return { ok: false, reason: 'rest' }
  return { ok: true }
}

const asDate = (day: string) => new Date(`${day}T00:00:00Z`)
const iso = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (day: string, n: number) => { const d = asDate(day); d.setUTCDate(d.getUTCDate() + n); return iso(d) }
/** 0 = Monday … 6 = Sunday. */
export const weekdayOf = (day: string) => (asDate(day).getUTCDay() + 6) % 7

/** The first session on or after `from`. */
export function firstSessionOnOrAfter(from: string, weekdays: number[]) {
  for (let i = 0; i < 7; i++) { const day = addDays(from, i); if (weekdays.includes(weekdayOf(day))) return day }
  return from
}

/** Every planned session date: `weeks` weeks from the start date's week. */
export function sessionDates(start: string, weekdays: number[], weeks: number): string[] {
  const monday = addDays(start, -weekdayOf(start))
  const dates: string[] = []
  for (let w = 0; w < weeks; w++) for (const day of [...weekdays].sort((a, b) => a - b)) {
    const date = addDays(monday, w * 7 + day)
    if (date >= start) dates.push(date)
  }
  // Starting mid-week shortens week 1; the plan still has weeks × perWeek sessions.
  const total = weeks * weekdays.length
  let w = weeks
  while (dates.length < total) {
    for (const day of [...weekdays].sort((a, b) => a - b)) if (dates.length < total) dates.push(addDays(monday, w * 7 + day))
    w++
  }
  return dates
}

export type Progress = {
  done: number; total: number; week: number; weeks: number
  today: string | null; next: string | null; doneToday: boolean; streakWeeks: number; finished: boolean
  thisWeek: { date: string; weekday: number; planned: boolean; done: boolean; isToday: boolean }[]
}

/**
 * Where an athlete stands on a programme. `checkins` are the session dates checked in. A
 * session counts if it was checked in on its planned day or any day of the same week (a
 * missed Tuesday done on Wednesday still counts); a week is "kept" when every planned session
 * of that week is done. The streak is the run of kept weeks ending with the last full week
 * (or this week, once it is kept).
 */
export function trainingProgress({ start, weekdays, weeks, checkins, today }: { start: string; weekdays: number[]; weeks: number; checkins: string[]; today: string }): Progress {
  const dates = sessionDates(start, weekdays, weeks)
  const startMonday = addDays(start, -weekdayOf(start))
  const weekIndex = (day: string) => Math.floor((asDate(day).getTime() - asDate(startMonday).getTime()) / (7 * 86400000))
  const doneByWeek = new Map<number, number>()
  for (const day of new Set(checkins)) doneByWeek.set(weekIndex(day), (doneByWeek.get(weekIndex(day)) ?? 0) + 1)
  const plannedByWeek = new Map<number, number>()
  for (const day of dates) plannedByWeek.set(weekIndex(day), (plannedByWeek.get(weekIndex(day)) ?? 0) + 1)
  const lastWeek = Math.max(...plannedByWeek.keys())
  let done = 0
  for (const [w, planned] of plannedByWeek) done += Math.min(planned, doneByWeek.get(w) ?? 0)
  const currentWeek = weekIndex(today)
  const kept = (w: number) => (doneByWeek.get(w) ?? 0) >= (plannedByWeek.get(w) ?? Infinity)
  let streakWeeks = 0
  for (let w = kept(currentWeek) ? currentWeek : currentWeek - 1; w >= 0 && kept(w); w--) streakWeeks++
  const doneToday = checkins.includes(today)
  const remaining = dates.filter(day => day >= today && !(day === today && doneToday))
  const thisMonday = addDays(today, -weekdayOf(today))
  return {
    done, total: dates.length, weeks, week: Math.min(Math.max(currentWeek + 1, 1), lastWeek + 1),
    today: dates.includes(today) ? today : null,
    next: remaining.find(day => day > today || (day === today && !doneToday)) ?? null,
    doneToday, streakWeeks, finished: done >= dates.length || today > dates[dates.length - 1],
    thisWeek: Array.from({ length: 7 }, (_, i) => {
      const date = addDays(thisMonday, i)
      return { date, weekday: i, planned: dates.includes(date), done: checkins.includes(date), isToday: date === today }
    }),
  }
}
