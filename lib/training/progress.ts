import { getProgram, type Program } from './content'
import { trainingProgress, weekdayOf, type Progress } from './schedule'
import { EFFORT_PER_SESSION } from '@/lib/athlete-home'

// The Progress tab (ADR-015, owner 8 Nov 2026). Only what the athlete recorded: sessions
// checked in, the minutes of those sessions, effort points, sessions per week, and where each
// active programme stands. Free of React and of the database, so it can be tested directly.

export const PROGRESS_WEEKS = 8

export type HistoryEnrollment = { id: string; program_id: string; weekdays: number[]; start_date: string; status: string }
export type HistoryCheckin = { enrollment_id: string; session_date: string }
export type ProgressView = {
  sessions: number
  minutes: number
  effort: number
  weeks: { monday: string; sessions: number }[]
  programmes: { programId: string; program: Program; progress: Progress }[]
}

const shift = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
const mondayOf = (day: string) => shift(day, -weekdayOf(day))

export function progressView({ enrollments, checkins, today }: { enrollments: HistoryEnrollment[]; checkins: HistoryCheckin[]; today: string }): ProgressView {
  const byId = new Map(enrollments.map(item => [item.id, item]))
  // One session per programme per day (the database keeps it so; a repeated row counts once).
  const unique = new Map<string, HistoryCheckin>()
  for (const row of checkins) unique.set(`${row.enrollment_id}|${row.session_date}`, row)
  const sessions = [...unique.values()]

  let minutes = 0
  for (const row of sessions) {
    const enrollment = byId.get(row.enrollment_id)
    const program = enrollment ? getProgram(enrollment.program_id) : null
    if (program) minutes += program.minutes
  }

  const thisMonday = mondayOf(today)
  const weeks = Array.from({ length: PROGRESS_WEEKS }, (_, index) => ({ monday: shift(thisMonday, -7 * (PROGRESS_WEEKS - 1 - index)), sessions: 0 }))
  const weekIndex = new Map(weeks.map((week, index) => [week.monday, index]))
  for (const row of sessions) {
    const index = weekIndex.get(mondayOf(row.session_date))
    if (index !== undefined) weeks[index].sessions++
  }

  const programmes: ProgressView['programmes'] = []
  for (const enrollment of enrollments) {
    if (enrollment.status !== 'active') continue
    const program = getProgram(enrollment.program_id)
    if (!program) continue
    const dates = sessions.filter(row => row.enrollment_id === enrollment.id).map(row => row.session_date)
    programmes.push({ programId: program.id, program, progress: trainingProgress({ start: enrollment.start_date, weekdays: enrollment.weekdays, weeks: program.weeks, checkins: dates, today }) })
  }

  return { sessions: sessions.length, minutes, effort: sessions.length * EFFORT_PER_SESSION, weeks, programmes }
}
