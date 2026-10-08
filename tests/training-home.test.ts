import { describe, expect, it } from 'vitest'
import { TRAINING_PROGRAMS, canSelfStart, getProgram } from '@/lib/training/content'
import { recommendedProgram, trainingHome } from '@/lib/training/home'
import type { MyTraining } from '@/lib/training/data'

// "ของฉัน" puts training first for an athlete (owner, report 9). Without a programme the
// button is "เลือกโปรแกรมซ้อม" and the page names the programme that fits the athlete's age.
describe('the programme recommended for an age', () => {
  it('is none when the age is not known', () => {
    expect(recommendedProgram(null)).toBeNull()
    expect(recommendedProgram(undefined)).toBeNull()
  })
  it.each([9, 12, 13, 14, 16, 17])('fits a %i-year-old: their own band, one they may start alone', age => {
    const program = recommendedProgram(age)
    expect(program).not.toBeNull()
    expect(canSelfStart(program!, age)).toBe(true)
    expect(program!.band).toBe(age <= 13 ? 'u10_u13' : 'u14_u17')
  })
  it('never offers a programme the athlete is too young for', () => {
    const restricted = TRAINING_PROGRAMS.filter(program => program.minAge)
    for (const program of restricted) expect(recommendedProgram((program.minAge ?? 0) - 1)?.id).not.toBe(program.id)
  })
})

describe('what the training card asks for today', () => {
  const program = TRAINING_PROGRAMS[0]
  const enrolled = (patch: Partial<MyTraining['enrollments'][number]> = {}): MyTraining => ({
    available: true,
    enrollments: [{ id: 'e1', program_id: program.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-10-05', status: 'active', ...patch }],
    checkins: {},
  })
  it('is hidden until training is switched on', () => {
    expect(trainingHome({ available: false, enrollments: [], checkins: {} }, '2026-10-08', 12)).toEqual({ state: 'hidden' })
  })
  it('asks the athlete to pick a programme, naming the one for their age', () => {
    const home = trainingHome({ available: true, enrollments: [], checkins: {} }, '2026-10-08', 12)
    expect(home.state).toBe('pick')
    if (home.state === 'pick') expect(home.recommended?.band).toBe('u10_u13')
  })
  it('asks to train today when a session is planned and not done', () => {
    const home = trainingHome(enrolled(), '2026-10-08', 12)
    expect(home.state).toBe('enrolled')
    if (home.state === 'enrolled') expect(home.needsAction).toBe(true)
  })
  it('does not ask again once today is done', () => {
    const done = { ...enrolled(), checkins: { e1: ['2026-10-08'] } }
    const home = trainingHome(done, '2026-10-08', 12)
    expect(home.state === 'enrolled' && home.needsAction).toBe(false)
  })
  it('treats an enrolment in an unknown programme as having none', () => {
    expect(getProgram('nope')).toBeNull()
    expect(trainingHome(enrolled({ program_id: 'nope' }), '2026-10-08', 12).state).toBe('pick')
  })
})
