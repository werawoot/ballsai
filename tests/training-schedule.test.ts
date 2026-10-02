import { describe, expect, it } from 'vitest'
import { checkWeekdays, firstSessionOnOrAfter, sessionDates, trainingProgress, weekdayOf } from '@/lib/training/schedule'

// 2026-10-05 is a Monday.
describe('choosing training days', () => {
  it('needs exactly the programme\'s sessions per week', () => {
    expect(checkWeekdays([0, 3], { band: 'u10_u13', perWeek: 2 })).toEqual({ ok: true })
    expect(checkWeekdays([0], { band: 'u10_u13', perWeek: 2 })).toEqual({ ok: false, reason: 'count' })
    expect(checkWeekdays([0, 0], { band: 'u10_u13', perWeek: 2 })).toEqual({ ok: false, reason: 'invalid' })
    expect(checkWeekdays([0, 7], { band: 'u10_u13', perWeek: 2 })).toEqual({ ok: false, reason: 'invalid' })
  })

  it('always leaves the rest days: two for U10–U13, one for U14–U17', () => {
    expect(checkWeekdays([0, 1, 2, 3, 4, 5], { band: 'u10_u13', perWeek: 6 })).toEqual({ ok: false, reason: 'rest' })
    expect(checkWeekdays([0, 1, 2, 3, 4], { band: 'u10_u13', perWeek: 5 })).toEqual({ ok: true })
    expect(checkWeekdays([0, 1, 2, 3, 4, 5], { band: 'u14_u17', perWeek: 6 })).toEqual({ ok: true })
  })
})

describe('the timetable', () => {
  it('knows Monday from Sunday', () => {
    expect(weekdayOf('2026-10-05')).toBe(0)
    expect(weekdayOf('2026-10-11')).toBe(6)
  })

  it('plans weeks × sessions, even when it starts mid-week', () => {
    expect(sessionDates('2026-10-05', [0, 3], 2)).toEqual(['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15'])
    // Starting on a Tuesday skips that Monday and adds a session at the end instead.
    expect(sessionDates('2026-10-06', [0, 3], 2)).toEqual(['2026-10-08', '2026-10-12', '2026-10-15', '2026-10-19'])
    expect(firstSessionOnOrAfter('2026-10-06', [0, 3])).toBe('2026-10-08')
  })
})

describe('progress and streaks', () => {
  const plan = { start: '2026-10-05', weekdays: [0, 3], weeks: 8 }

  it('counts done sessions and what is next', () => {
    const p = trainingProgress({ ...plan, checkins: ['2026-10-05'], today: '2026-10-07' })
    expect(p).toMatchObject({ done: 1, total: 16, week: 1, next: '2026-10-08', today: null, doneToday: false })
    expect(p.thisWeek.filter(d => d.planned).map(d => d.date)).toEqual(['2026-10-05', '2026-10-08'])
  })

  it('counts a session done later in the same week, and checking in twice once', () => {
    const p = trainingProgress({ ...plan, checkins: ['2026-10-06', '2026-10-06', '2026-10-09'], today: '2026-10-12' })
    expect(p.done).toBe(2)
    expect(p.streakWeeks).toBe(1)
  })

  it('makes a streak of kept weeks, not consecutive days, and breaks on a missed week', () => {
    const kept = ['2026-10-05', '2026-10-08', '2026-10-12', '2026-10-15']
    expect(trainingProgress({ ...plan, checkins: kept, today: '2026-10-20' }).streakWeeks).toBe(2)
    expect(trainingProgress({ ...plan, checkins: ['2026-10-05', '2026-10-08', '2026-10-15'], today: '2026-10-20' }).streakWeeks).toBe(0)
  })

  it('shows today as a training day until it is checked in', () => {
    expect(trainingProgress({ ...plan, checkins: [], today: '2026-10-08' })).toMatchObject({ today: '2026-10-08', next: '2026-10-08', doneToday: false })
    expect(trainingProgress({ ...plan, checkins: ['2026-10-08'], today: '2026-10-08' })).toMatchObject({ doneToday: true, next: '2026-10-12' })
  })

  it('finishes after the last planned session', () => {
    expect(trainingProgress({ ...plan, checkins: [], today: '2026-12-31' }).finished).toBe(true)
  })
})
