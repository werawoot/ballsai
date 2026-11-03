import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS } from '@/lib/training/content'
import { trainingTab, trainingToday } from '@/lib/training/today'
import type { MyTraining } from '@/lib/training/data'

// /training "ตารางของฉัน" (second reference, owner 2 Nov 2026): the week across every active
// programme, and today's programmes with their drills. Check-ins are the athlete's own
// (SQL63), one per programme per day; nothing is counted per drill.

const [first, second] = TRAINING_PROGRAMS
// 2026-10-28 is a Wednesday (weekday 2).
const WED = '2026-10-28'
const training = (checkins: Record<string, string[]> = {}): MyTraining => ({
  available: true,
  enrollments: [
    { id: 'e1', program_id: first.id, weekdays: [0, 2, 4], start_date: '2026-10-05', status: 'active' },
    { id: 'e2', program_id: second.id, weekdays: [2, 5], start_date: '2026-10-05', status: 'active' },
  ],
  checkins,
})

describe('the week of all my programmes', () => {
  it('runs Monday to Sunday and marks today', () => {
    const view = trainingToday(training(), WED)
    expect(view.week.map(day => day.date)).toEqual(['2026-10-26', '2026-10-27', WED, '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01'])
    expect(view.week.find(day => day.isToday)?.date).toBe(WED)
    expect(view.week.map(day => day.dayOfMonth)).toEqual([26, 27, 28, 29, 30, 31, 1])
  })

  it('plans a day when any programme trains that day, and marks it done when one was checked in', () => {
    const view = trainingToday(training({ e1: ['2026-10-26'] }), WED)
    expect(view.week.map(day => day.planned)).toEqual([true, false, true, false, true, true, false])
    expect(view.week[0].done).toBe(true)
    expect(view.week[2].done).toBe(false)
  })
})

describe('today\'s programmes', () => {
  it('lists each programme planned today, with its drills, done or not', () => {
    const view = trainingToday(training({ e2: [WED] }), WED)
    expect(view.today.map(item => item.program.id)).toEqual([first.id, second.id])
    expect(view.today.map(item => item.done)).toEqual([false, true])
    expect(view.today[0].program.drills.length).toBeGreaterThan(0)
    expect(view.doneToday).toBe(1)
    expect(view.plannedToday).toBe(2)
  })

  it('is empty on a rest day', () => {
    const view = trainingToday(training(), '2026-10-27')
    expect(view.today).toEqual([])
    expect(view.plannedToday).toBe(0)
  })

  it('skips an enrolment in a programme that no longer exists', () => {
    const view = trainingToday({ ...training(), enrollments: [{ id: 'x', program_id: 'gone', weekdays: [2], start_date: '2026-10-05', status: 'active' }] }, WED)
    expect(view.today).toEqual([])
    expect(view.programs).toEqual([])
  })

  it('lists every active programme with its progress', () => {
    const view = trainingToday(training({ e1: ['2026-10-26'] }), WED)
    expect(view.programs.map(item => item.program.id)).toEqual([first.id, second.id])
    expect(view.programs[0].progress.done).toBeGreaterThanOrEqual(1)
  })
})

describe('the tab /training opens on', () => {
  it('opens on my schedule for an athlete with a programme, otherwise the programmes', () => {
    expect(trainingTab(undefined, true)).toBe('mine')
    expect(trainingTab(undefined, false)).toBe('programs')
  })
  it('follows the address, but never shows my schedule to someone without one', () => {
    expect(trainingTab('skills', true)).toBe('skills')
    expect(trainingTab('programs', true)).toBe('programs')
    expect(trainingTab('mine', false)).toBe('programs')
    expect(trainingTab('nonsense', true)).toBe('mine')
  })
})
