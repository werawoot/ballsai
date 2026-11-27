// Running mode V1 (ADR-016, owner 25 Nov 2026): runs logged by hand and a weekly goal. Free of
// React and of the database so every rule can be tested; the same limits as sql/108's checks.

export type RunForm = { date: string; km: string; minutes: string; seconds: string }
export type ParsedRun = { runDate: string; distanceM: number; durationS: number }
export type RunProblem = 'runDate' | 'runFuture' | 'runDistance' | 'runDuration' | 'runTooFast'
export type RunGoal = { unit: 'runs' | 'km'; target: number }
export type RunWeek = { weekStart: string; runs: number; distanceM: number; durationS: number }

export const RUN_LIMITS = { minM: 100, maxM: 100_000, minS: 60, maxS: 86_400, fastestSecondsPerKm: 150, firstDate: '2020-01-01' } as const
export const GOAL_LIMITS = { runs: 14, km: 300 } as const

const wholeNumber = (value: string) => /^\d{1,5}$/.test(value.trim()) ? Number(value.trim()) : null

/** The form as metres and seconds, or the first thing wrong with it. `today` is Bangkok's date. */
export function parseRun(form: RunForm, today: string): { ok: true; run: ParsedRun } | { ok: false; problem: RunProblem } {
  const date = form.date.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || date < RUN_LIMITS.firstDate) return { ok: false, problem: 'runDate' }
  if (date > today) return { ok: false, problem: 'runFuture' }
  const km = form.km.trim().replace(',', '.')
  const distanceM = /^\d{1,3}(\.\d{1,3})?$/.test(km) ? Math.round(Number(km) * 1000) : NaN
  if (!(distanceM >= RUN_LIMITS.minM && distanceM <= RUN_LIMITS.maxM)) return { ok: false, problem: 'runDistance' }
  const minutes = wholeNumber(form.minutes || '0')
  const seconds = wholeNumber(form.seconds || '0')
  if (minutes === null || seconds === null || seconds > 59) return { ok: false, problem: 'runDuration' }
  const durationS = minutes * 60 + seconds
  if (durationS < RUN_LIMITS.minS || durationS > RUN_LIMITS.maxS) return { ok: false, problem: 'runDuration' }
  if (durationS * 1000 < distanceM * RUN_LIMITS.fastestSecondsPerKm) return { ok: false, problem: 'runTooFast' }
  return { ok: true, run: { runDate: date, distanceM, durationS } }
}

/** Minutes:seconds per km. */
export function paceText(distanceM: number, durationS: number) {
  const perKm = Math.round((durationS * 1000) / distanceM)
  return `${Math.floor(perKm / 60)}:${String(perKm % 60).padStart(2, '0')}`
}

const amount = (goal: RunGoal, week: RunWeek) => goal.unit === 'runs' ? week.runs : Math.round(week.distanceM / 100) / 10

export function goalProgress(goal: RunGoal, week: RunWeek) {
  const done = amount(goal, week)
  return { done, target: goal.target, met: done >= goal.target }
}

/** Weeks in a row that met the goal, newest first; this week counts once it is met, and an
 *  unfinished week does not break the streak of the weeks before it. */
export function weekStreak(goal: RunGoal | null, weeks: RunWeek[]) {
  if (!goal || weeks.length === 0) return 0
  const [current, ...before] = weeks
  let streak = goalProgress(goal, current).met ? 1 : 0
  for (const week of before) {
    if (!goalProgress(goal, week).met) break
    streak += 1
  }
  return streak
}
