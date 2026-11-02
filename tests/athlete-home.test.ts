import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS } from '@/lib/training/content'
import { trainingHome } from '@/lib/training/home'
import type { MyTraining } from '@/lib/training/data'
import { lastMatchChange, openTournamentsAhead, radarPoints, todayMissions, verifiedSkills, weeklyGoal } from '@/lib/athlete-home'

// The athlete's "ของฉัน" in the DOENSAI dashboard design (owner, 2 Nov 2026): today's
// missions, the week's training goal, the change of the last verified match and the skills a
// coach assessed. Every number here has a source; nothing is shown in place of a missing one.

const program = TRAINING_PROGRAMS[0]
const everyDay = (checkins: string[] = []): MyTraining => ({
  available: true,
  enrollments: [{ id: 'e1', program_id: program.id, weekdays: [0, 2, 4], start_date: '2026-10-05', status: 'active' }],
  checkins: { e1: checkins },
})
// 2026-10-28 is a Wednesday (weekday 2), a planned day of the plan above.
const WED = '2026-10-28'

describe('today\'s missions', () => {
  const base = { readinessNext: null, pendingTeamInvites: 0, hasOpenTournament: false }

  it('starts with training: today\'s session, not done yet', () => {
    const missions = todayMissions({ ...base, training: trainingHome(everyDay(), WED, 12) })
    expect(missions[0]).toMatchObject({ key: 'train', done: false, target: 'tr-today-title', minutes: program.minutes })
  })

  it('marks training done once today is checked in', () => {
    const missions = todayMissions({ ...base, training: trainingHome(everyDay([WED]), WED, 12) })
    expect(missions[0]).toMatchObject({ key: 'train', done: true })
  })

  it('calls a day off a rest day, done, not a missed task', () => {
    const missions = todayMissions({ ...base, training: trainingHome(everyDay(), '2026-10-29', 12) })
    expect(missions[0]).toMatchObject({ key: 'rest', done: true })
  })

  it('asks to pick a programme when there is none', () => {
    const missions = todayMissions({ ...base, training: trainingHome({ available: true, enrollments: [], checkins: {} }, WED, 12) })
    expect(missions[0]).toMatchObject({ key: 'pickProgram', done: false })
  })

  it('leaves training out before SQL63', () => {
    expect(todayMissions({ ...base, training: { state: 'hidden' } })).toEqual([])
  })

  it('then team invitations, the next profile step, and open tournaments, at most three in all', () => {
    const missions = todayMissions({
      training: trainingHome(everyDay(), WED, 12),
      pendingTeamInvites: 2,
      readinessNext: 'photo',
      hasOpenTournament: true,
    })
    expect(missions.map(item => item.key)).toEqual(['train', 'answerInvites', 'profileStep'])
    expect(missions[1]).toMatchObject({ count: 2, target: 'pf-teams' })
    expect(missions[2]).toMatchObject({ step: 'photo', target: 'pf-readiness' })
  })

  it('suggests an open tournament when nothing else waits', () => {
    const missions = todayMissions({ ...base, training: trainingHome(everyDay([WED]), WED, 12), hasOpenTournament: true })
    expect(missions.map(item => item.key)).toEqual(['train', 'openTournament'])
  })

  it('never carries an XP reward: training is self-reported (SQL63)', () => {
    const missions = todayMissions({ training: trainingHome(everyDay(), WED, 12), pendingTeamInvites: 1, readinessNext: 'photo', hasOpenTournament: true })
    for (const mission of missions) expect(mission).not.toHaveProperty('xp')
  })
})

describe('the week\'s training goal', () => {
  it('counts the sessions done against the sessions planned this week', () => {
    const home = trainingHome(everyDay(['2026-10-26']), WED, 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress)).toEqual({ done: 1, planned: 3, percent: 33 })
  })

  it('counts a missed session made up on another day of the same week', () => {
    const home = trainingHome(everyDay(['2026-10-27']), WED, 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress)).toMatchObject({ done: 1, planned: 3 })
  })

  it('never goes past the plan', () => {
    const home = trainingHome(everyDay(['2026-10-26', '2026-10-27', WED, '2026-10-29']), WED, 12)
    expect(home.state === 'enrolled' && weeklyGoal(home.progress)).toEqual({ done: 3, planned: 3, percent: 100 })
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

describe('open tournaments on the athlete home', () => {
  const row = (id: string, start: string, end: string | null = null) => ({ id, name: id, location: null, start_date: start, end_date: end, fee: 0, status: 'open' })

  it('leaves out what is already over and keeps the soonest three', () => {
    const rows = [row('past', '2026-10-01', '2026-10-02'), row('a', '2026-11-05'), row('running', '2026-10-30', '2026-11-20'), row('b', '2026-11-10'), row('c', '2026-12-01')]
    expect(openTournamentsAhead(rows, '2026-11-02').map(item => item.id)).toEqual(['running', 'a', 'b'])
  })

  it('takes nothing that is not open', () => {
    expect(openTournamentsAhead([{ ...row('x', '2026-11-05'), status: 'closed' }], '2026-11-02')).toEqual([])
  })
})
