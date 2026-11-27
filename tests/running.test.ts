import { describe, expect, it } from 'vitest'
import { adjustWeek, durationText, goalProgress, paceText, parseRun, weekStreak, type RunWeek } from '@/lib/running'

// Running mode V1 (ADR-016, owner 25 Nov 2026): a run is logged by hand, by its owner, and stays
// "self" data. These rules match sql/108's checks, so the page refuses what the database would.
describe('reading the run form', () => {
  const today = '2026-11-26'

  it('turns km and minutes:seconds into metres and seconds', () => {
    expect(parseRun({ date: '2026-11-25', km: '5.2', minutes: '31', seconds: '05' }, today)).toEqual({ ok: true, run: { runDate: '2026-11-25', distanceM: 5200, durationS: 1865 } })
    expect(parseRun({ date: today, km: '3', minutes: '20', seconds: '' }, today)).toEqual({ ok: true, run: { runDate: today, distanceM: 3000, durationS: 1200 } })
  })

  it('accepts a comma as the decimal point', () => {
    expect(parseRun({ date: today, km: '2,5', minutes: '15', seconds: '0' }, today)).toMatchObject({ ok: true, run: { distanceM: 2500 } })
  })

  it.each([
    [{ date: '2026-11-27', km: '3', minutes: '20', seconds: '0' }, 'runFuture'],
    [{ date: '2019-12-31', km: '3', minutes: '20', seconds: '0' }, 'runDate'],
    [{ date: 'yesterday', km: '3', minutes: '20', seconds: '0' }, 'runDate'],
    [{ date: today, km: '0.05', minutes: '5', seconds: '0' }, 'runDistance'],
    [{ date: today, km: '101', minutes: '900', seconds: '0' }, 'runDistance'],
    [{ date: today, km: 'abc', minutes: '20', seconds: '0' }, 'runDistance'],
    [{ date: today, km: '3', minutes: '0', seconds: '30' }, 'runDuration'],
    [{ date: today, km: '3', minutes: '20', seconds: '75' }, 'runDuration'],
    [{ date: today, km: '10', minutes: '20', seconds: '0' }, 'runTooFast'],
  ])('refuses %j with %s', (form, problem) => {
    expect(parseRun(form, today)).toEqual({ ok: false, problem })
  })
})

describe('pace', () => {
  it('reads minutes and seconds per km', () => {
    expect(paceText(5000, 1800)).toBe('6:00')
    expect(paceText(5200, 1865)).toBe('5:59')
    expect(paceText(1000, 400)).toBe('6:40')
  })
})

describe('the weekly goal and the streak', () => {
  // Newest first, as my_run_weeks returns them.
  const weeks = (rows: [number, number][]): RunWeek[] => rows.map(([runs, km], index) => ({ weekStart: `2026-11-${String(23 - 7 * index).padStart(2, '0')}`, runs, distanceM: km * 1000, durationS: runs * 1800 }))

  it('measures this week against the goal, in runs or km', () => {
    expect(goalProgress({ unit: 'runs', target: 3 }, weeks([[2, 10]])[0])).toEqual({ done: 2, target: 3, met: false })
    expect(goalProgress({ unit: 'km', target: 15 }, weeks([[3, 16.4]])[0])).toEqual({ done: 16.4, target: 15, met: true })
  })

  it('counts the weeks in a row that met the goal, this week only once it is met', () => {
    const goal = { unit: 'runs' as const, target: 2 }
    expect(weekStreak(goal, weeks([[1, 3], [2, 6], [3, 9], [0, 0], [2, 5]]))).toBe(2)
    expect(weekStreak(goal, weeks([[2, 3], [2, 6], [3, 9], [0, 0]]))).toBe(3)
    expect(weekStreak(goal, weeks([[0, 0], [0, 0]]))).toBe(0)
  })

  it('has no streak without a goal', () => {
    expect(weekStreak(null, weeks([[5, 20]]))).toBe(0)
  })
})

describe('this week on screen before the page refreshes', () => {
  const week: RunWeek = { weekStart: '2026-11-23', runs: 2, distanceM: 8000, durationS: 3000 }
  const run = (date: string, m: number) => ({ run_date: date, distance_m: m, duration_s: 600 })

  it('adds what was saved this week, and only this week', () => {
    expect(adjustWeek(week, [run('2026-11-25', 5000), run('2026-11-20', 3000)], [])).toEqual({ weekStart: '2026-11-23', runs: 3, distanceM: 13000, durationS: 3600 })
  })

  it('takes off what was removed, so a run added then removed counts nothing', () => {
    const added = run('2026-11-25', 5000)
    expect(adjustWeek(week, [added], [added])).toEqual(week)
    expect(adjustWeek(week, [], [run('2026-11-24', 3000)])).toEqual({ weekStart: '2026-11-23', runs: 1, distanceM: 5000, durationS: 2400 })
  })
})

describe('duration', () => {
  it('reads minutes:seconds, with hours when there are any', () => {
    expect(durationText(1865)).toBe('31:05')
    expect(durationText(3750)).toBe('1:02:30')
  })
})
