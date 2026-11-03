import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS } from '@/lib/training/content'
import { trainingHome } from '@/lib/training/home'
import type { MyTraining } from '@/lib/training/data'
import { trainingToday } from '@/lib/training/today'
import { EFFORT_PER_SESSION, dayStreak, effortSummary, nextSession, openTournamentsAhead, todayMissionList, totalMinutes } from '@/lib/athlete-home'
import { bangkokWeekStart, lastMatchChange, programSkills, weekTotals, radarPoints, verifiedSkills, weekXp, weeklyGoal } from '@/lib/athlete-home'

// The athlete's home in the DOENSAI dashboard design (owner, 2 Nov 2026): the week's
// training goal, the change of the last verified match and the skills a
// coach assessed. Every number here has a source; nothing is shown in place of a missing one.

const program = TRAINING_PROGRAMS[0]
const everyDay = (checkins: string[] = []): MyTraining => ({
  available: true,
  enrollments: [{ id: 'e1', program_id: program.id, weekdays: [0, 2, 4], start_date: '2026-10-05', status: 'active' }],
  checkins: { e1: checkins },
})
// 2026-10-28 is a Wednesday (weekday 2), a planned day of the plan above.
const WED = '2026-10-28'

describe('the week\'s training goal', () => {
  it('counts the sessions done against the sessions planned this week, and their minutes', () => {
    const home = trainingHome(everyDay(['2026-10-26']), WED, 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress, 15)).toEqual({ done: 1, planned: 3, percent: 33, minutes: 15 })
  })

  it('counts a missed session made up on another day of the same week', () => {
    const home = trainingHome(everyDay(['2026-10-27']), WED, 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress)).toMatchObject({ done: 1, planned: 3 })
  })

  it('never goes past the plan', () => {
    const home = trainingHome(everyDay(['2026-10-26', '2026-10-27', WED, '2026-10-29']), WED, 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress, 20)).toEqual({ done: 3, planned: 3, percent: 100, minutes: 60 })
  })

  it('is nothing in a week with no planned session', () => {
    const home = trainingHome(everyDay(), '2026-10-04', 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress)).toBeNull()
  })
})

describe('the change of the last verified match', () => {
  it('shows the change once there is a match', () => {
    expect(lastMatchChange({ matches_played: 3, last_rating_change: 15 })).toBe(15)
    expect(lastMatchChange({ matches_played: 3, last_rating_change: -8 })).toBe(-8)
  })

  it('shows nothing without a match, without a change, or after a void reset it', () => {
    expect(lastMatchChange(null)).toBeNull()
    expect(lastMatchChange({ matches_played: 0, last_rating_change: 0 })).toBeNull()
    expect(lastMatchChange({ matches_played: 4, last_rating_change: 0 })).toBeNull()
    expect(lastMatchChange({ matches_played: 2, last_rating_change: null })).toBeNull()
  })
})

describe('the skills a coach assessed', () => {
  const row = { speed: 70, stamina: 64, strength: null, technique: 81, vision: 58, source_level: 'coach_verified', created_at: '2026-10-20T03:00:00Z' }

  it('keeps only the assessed skills, in a fixed order', () => {
    expect(verifiedSkills(row)).toEqual({
      date: '2026-10-20T03:00:00Z',
      source: 'coach_verified',
      skills: [['speed', 70], ['stamina', 64], ['technique', 81], ['vision', 58]],
    })
  })

  it('needs at least three to draw a shape', () => {
    expect(verifiedSkills({ ...row, stamina: null, vision: null })).toBeNull()
  })

  it('never draws the athlete\'s own self-assessment', () => {
    expect(verifiedSkills({ ...row, source_level: 'self' })).toBeNull()
  })

  it('draws nothing without a row', () => {
    expect(verifiedSkills(null)).toBeNull()
  })

  it('puts the first point straight up and a full score on the rim', () => {
    const points = radarPoints([99, 0, 99], 50)
    expect(points[0]).toEqual({ x: 0, y: -50 })
    expect(points[1].x).toBeCloseTo(0)
    expect(points[1].y).toBeCloseTo(0)
    expect(Math.hypot(points[2].x, points[2].y)).toBeCloseTo(50)
  })
})

describe('the week on the athlete home (second reference, owner 2 Nov 2026)', () => {
  it('starts the week on Monday at midnight in Thailand', () => {
    // 2026-11-04 is a Wednesday; Monday 2026-11-02 00:00 in Bangkok is 2026-11-01 17:00 UTC.
    expect(bangkokWeekStart('2026-11-04')).toBe('2026-11-01T17:00:00.000Z')
    expect(bangkokWeekStart('2026-11-02')).toBe('2026-11-01T17:00:00.000Z')
    expect(bangkokWeekStart('2026-11-08')).toBe('2026-11-01T17:00:00.000Z')
  })

  it('adds up only the XP of verified matches this week', () => {
    expect(weekXp([{ xp_amount: 50 }, { xp_amount: 20 }])).toBe(70)
    expect(weekXp([])).toBe(0)
    expect(weekXp(null)).toBe(0)
  })

  it('names each skill a programme trains once', () => {
    const skills = programSkills(program)
    expect(skills.length).toBeGreaterThan(0)
    expect(new Set(skills).size).toBe(skills.length)
  })

})

describe('the week across every programme (review, 3 Nov 2026)', () => {
  const two = (checkins: Record<string, string[]>): MyTraining => ({
    available: true,
    enrollments: [
      { id: 'e1', program_id: program.id, weekdays: [0, 2, 4], start_date: '2026-10-05', status: 'active' },
      { id: 'e2', program_id: TRAINING_PROGRAMS[1].id, weekdays: [1], start_date: '2026-10-05', status: 'active' },
    ],
    checkins,
  })

  it('adds up sessions, plan and minutes of all active programmes, as /training does', () => {
    const totals = weekTotals(trainingToday(two({ e2: ['2026-10-27'] }), WED))
    expect(totals).toEqual({ done: 1, planned: 4, percent: 25, minutes: TRAINING_PROGRAMS[1].minutes, skills: programSkills(TRAINING_PROGRAMS[1]).length })
  })

  it('counts each skill once across programmes trained this week', () => {
    const totals = weekTotals(trainingToday(two({ e1: ['2026-10-26'], e2: ['2026-10-27'] }), WED))
    const union = new Set([...programSkills(program), ...programSkills(TRAINING_PROGRAMS[1])])
    expect(totals?.skills).toBe(union.size)
  })

  it('is nothing in a week with no planned session', () => {
    expect(weekTotals(trainingToday(two({}), '2026-10-04'))).toBeNull()
  })
})

describe('the home of the third reference (owner, 3 Nov 2026): effort points and missions', () => {
  const plan = (checkins: Record<string, string[]>): MyTraining => ({
    available: true,
    enrollments: [
      { id: 'e1', program_id: program.id, weekdays: [0, 2, 4], start_date: '2026-10-05', status: 'active' },
      { id: 'e2', program_id: TRAINING_PROGRAMS[1].id, weekdays: [2], start_date: '2026-10-05', status: 'active' },
    ],
    checkins,
  })

  it('makes each programme planned today a mission worth 50 effort points, done or not', () => {
    const missions = todayMissionList(trainingToday(plan({ e2: [WED] }), WED))
    expect(missions.map(item => [item.programId, item.done, item.points])).toEqual([[program.id, false, EFFORT_PER_SESSION], [TRAINING_PROGRAMS[1].id, true, EFFORT_PER_SESSION]])
    expect(missions[0].minutes).toBe(program.minutes)
    expect(EFFORT_PER_SESSION).toBe(50)
  })

  it('offers what today can still earn and what this week earned, from check-ins only', () => {
    const view = trainingToday(plan({ e1: ['2026-10-26', WED], e2: [WED] }), WED)
    expect(effortSummary(view)).toEqual({ todayEarned: 100, todayPossible: 100, week: 150 })
  })

  it('earns nothing on a rest day and nothing without a check-in', () => {
    expect(effortSummary(trainingToday(plan({}), '2026-10-27'))).toEqual({ todayEarned: 0, todayPossible: 0, week: 0 })
  })

  it('adds up minutes of every session done on the active programmes', () => {
    const view = trainingToday(plan({ e1: ['2026-10-12', '2026-10-26'], e2: ['2026-10-21'] }), WED)
    expect(totalMinutes(view)).toBe(2 * program.minutes + TRAINING_PROGRAMS[1].minutes)
  })

  it('names the next session that is not done yet, today first', () => {
    expect(nextSession(trainingToday(plan({}), WED))).toMatchObject({ date: WED, programId: program.id })
    expect(nextSession(trainingToday(plan({ e1: [WED], e2: [WED] }), WED))).toMatchObject({ date: '2026-10-30', programId: program.id })
    expect(nextSession(trainingToday({ available: true, enrollments: [], checkins: {} }, WED))).toBeNull()
  })
})

describe('days in a row', () => {
  const daily = (checkins: string[], weekdays = [0, 1, 2, 3, 4, 5, 6]): MyTraining => ({
    available: true,
    enrollments: [{ id: 'e1', program_id: program.id, weekdays, start_date: '2026-10-05', status: 'active' }],
    checkins: { e1: checkins },
  })

  it('counts planned days trained, back from today', () => {
    expect(dayStreak(daily(['2026-10-26', '2026-10-27', WED]), WED)).toBe(3)
  })

  it('does not break on today before it is trained', () => {
    expect(dayStreak(daily(['2026-10-26', '2026-10-27']), WED)).toBe(2)
  })

  it('skips rest days instead of breaking on them', () => {
    // Mon, Wed, Fri plan: Mon and Wed trained, Tuesday is rest.
    expect(dayStreak(daily(['2026-10-26', WED], [0, 2, 4]), WED)).toBe(2)
  })

  it('stops at a planned day that was missed', () => {
    expect(dayStreak(daily(['2026-10-26', WED]), WED)).toBe(1)
  })

  it('is zero with nothing trained', () => {
    expect(dayStreak(daily([]), WED)).toBe(0)
  })
})

describe('open tournaments on the athlete home', () => {
  const row = (id: string, start: string, end: string | null = null) => ({ id, status: 'open', start_date: start, end_date: end })
  it('keeps open ones not over yet, soonest first', () => {
    const rows = [row('past', '2026-10-01', '2026-10-02'), row('b', '2026-11-10'), row('running', '2026-10-30', '2026-11-20'), { ...row('closed', '2026-11-05'), status: 'closed' }]
    expect(openTournamentsAhead(rows, '2026-11-02').map(item => item.id)).toEqual(['running', 'b'])
  })
})
