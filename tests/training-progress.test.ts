import { describe, expect, it } from 'vitest'
import { progressView, PROGRESS_WEEKS } from '@/lib/training/progress'
import { getProgram } from '@/lib/training/content'
import { EFFORT_PER_SESSION } from '@/lib/athlete-home'

// The Progress tab (ADR-015, owner 8 Nov 2026): only what the athlete really recorded:
// sessions checked in, minutes of those sessions, effort points, sessions per week, and
// where each active programme stands. Nothing is estimated.

const program = getProgram('u14-prevention-01')!
const enrollment = (id: string, status = 'active', start = '2026-10-05') => ({ id, program_id: program.id, weekdays: [0, 2, 4], start_date: start, status })

describe('the progress of an athlete', () => {
  it('counts every recorded session, its minutes and its effort points, finished programmes included', () => {
    const view = progressView({
      enrollments: [enrollment('a'), enrollment('old', 'completed', '2026-08-03')],
      checkins: [
        { enrollment_id: 'a', session_date: '2026-11-02' },
        { enrollment_id: 'a', session_date: '2026-11-04' },
        { enrollment_id: 'old', session_date: '2026-08-03' },
      ],
      today: '2026-11-08',
    })
    expect(view.sessions).toBe(3)
    expect(view.minutes).toBe(3 * program.minutes)
    expect(view.effort).toBe(3 * EFFORT_PER_SESSION)
  })

  it('counts a session once even if it was sent twice', () => {
    const view = progressView({ enrollments: [enrollment('a')], checkins: [{ enrollment_id: 'a', session_date: '2026-11-02' }, { enrollment_id: 'a', session_date: '2026-11-02' }], today: '2026-11-08' })
    expect(view.sessions).toBe(1)
  })

  it('shows the last eight weeks, oldest first, Monday to Sunday in Bangkok dates', () => {
    const view = progressView({
      enrollments: [enrollment('a')],
      checkins: [{ enrollment_id: 'a', session_date: '2026-11-02' }, { enrollment_id: 'a', session_date: '2026-11-08' }, { enrollment_id: 'a', session_date: '2026-10-28' }],
      today: '2026-11-08',
    })
    expect(view.weeks).toHaveLength(PROGRESS_WEEKS)
    expect(view.weeks.at(-1)).toEqual({ monday: '2026-11-02', sessions: 2 })
    expect(view.weeks.at(-2)).toEqual({ monday: '2026-10-26', sessions: 1 })
    expect(view.weeks[0].monday).toBe('2026-09-14')
  })

  it('lists where each active programme stands, not the finished ones', () => {
    const view = progressView({ enrollments: [enrollment('a'), enrollment('old', 'completed', '2026-08-03')], checkins: [{ enrollment_id: 'a', session_date: '2026-10-05' }], today: '2026-11-08' })
    expect(view.programmes.map(item => item.programId)).toEqual([program.id])
    expect(view.programmes[0].progress.done).toBe(1)
    expect(view.programmes[0].progress.total).toBe(program.weeks * 3)
  })

  it('ignores a programme it does not know, and is empty for a new athlete', () => {
    const unknown = progressView({ enrollments: [{ ...enrollment('x'), program_id: 'gone' }], checkins: [{ enrollment_id: 'x', session_date: '2026-11-02' }], today: '2026-11-08' })
    expect(unknown.sessions).toBe(1)
    expect(unknown.minutes).toBe(0)
    expect(unknown.programmes).toEqual([])
    const fresh = progressView({ enrollments: [], checkins: [], today: '2026-11-08' })
    expect(fresh.sessions).toBe(0)
    expect(fresh.weeks.every(week => week.sessions === 0)).toBe(true)
  })
})
