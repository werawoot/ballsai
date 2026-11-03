import { getProgram, type Program } from './content'
import type { Enrollment, MyTraining } from './data'
import { trainingProgress, weekdayOf, type Progress } from './schedule'

// /training "ตารางของฉัน" (second reference, owner 2 Nov 2026): the week across every active
// programme and today's programmes with their drills. Check-ins are the athlete's own, one per
// programme per day (SQL63); nothing is counted per drill, so a drill shows no tick of its own.
// Free of React and of the database, so every rule can be tested directly.

export type TrainingTab = 'mine' | 'programs' | 'skills'
const TABS: readonly TrainingTab[] = ['mine', 'programs', 'skills']

/** The tab to open: the address's, else my schedule when there is a programme to show. */
export function trainingTab(value: string | undefined, hasProgramme: boolean): TrainingTab {
  const asked = TABS.includes(value as TrainingTab) ? value as TrainingTab : null
  if (asked === 'mine' && !hasProgramme) return 'programs'
  return asked ?? (hasProgramme ? 'mine' : 'programs')
}

export type WeekDay = { date: string; weekday: number; dayOfMonth: number; planned: boolean; done: boolean; isToday: boolean }
export type ProgrammeToday = { enrollment: Enrollment; program: Program; progress: Progress; done: boolean }
export type TrainingTodayView = {
  week: WeekDay[]
  today: ProgrammeToday[]
  programs: { enrollment: Enrollment; program: Program; progress: Progress }[]
  doneToday: number
  plannedToday: number
}

export function trainingToday(training: MyTraining, today: string): TrainingTodayView {
  const programs = training.enrollments.flatMap(enrollment => {
    const program = getProgram(enrollment.program_id)
    if (!program) return []
    const progress = trainingProgress({ start: enrollment.start_date, weekdays: enrollment.weekdays, weeks: program.weeks, checkins: training.checkins[enrollment.id] ?? [], today })
    return [{ enrollment, program, progress }]
  })
  const monday = new Date(`${today}T00:00:00Z`)
  monday.setUTCDate(monday.getUTCDate() - weekdayOf(today))
  const week: WeekDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday)
    date.setUTCDate(monday.getUTCDate() + index)
    const iso = date.toISOString().slice(0, 10)
    const days = programs.map(item => item.progress.thisWeek[index])
    return {
      date: iso,
      weekday: index,
      dayOfMonth: date.getUTCDate(),
      planned: days.some(day => day?.planned),
      done: days.some(day => day?.done),
      isToday: iso === today,
    }
  })
  const todayList = programs.filter(item => item.progress.today === today).map(item => ({ ...item, done: item.progress.doneToday }))
  return { week, today: todayList, programs, doneToday: todayList.filter(item => item.done).length, plannedToday: todayList.length }
}
