import { afterEach, describe, expect, it } from 'vitest'
import { isCalendarDay, removedSelfTestSummary, savedSelfTestSummary, selfTestHistoryPath, selfTestReminder, parseSelfTestValue, selfTestSummary, selfTestsEnabled, testsFor, SELF_TEST_KEYS, SELF_TESTS } from '@/lib/training/self-tests'

// The three self-tests (owner, 10 and 11 Nov 2026; docs/research/self-tests-2026-11-10.md).

describe('self-tests', () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_SELF_TESTS })

  it('are the three tests the owner chose, hidden unless the flag is exactly "true"', () => {
    expect(SELF_TEST_KEYS).toEqual(['juggling', 'plank', 'long_jump'])
    expect(selfTestsEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_SELF_TESTS = 'TRUE'
    expect(selfTestsEnabled()).toBe(false)
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    expect(selfTestsEnabled()).toBe(true)
  })

  it('keep the careful defaults until the coach answers: plank stops at 2 minutes, long jump from 12', () => {
    expect(SELF_TESTS.plank.max).toBe(120)
    expect(SELF_TESTS.long_jump.minAge).toBe(12)
    expect(SELF_TESTS.juggling.attempts).toBe(3)
    expect(SELF_TESTS.long_jump.attempts).toBe(2)
    expect(SELF_TESTS.plank.attempts).toBe(1)
  })

  it('accept only whole numbers inside each range', () => {
    expect(parseSelfTestValue('juggling', ' 25 ')).toBe(25)
    expect(parseSelfTestValue('juggling', '0')).toBe(0)
    expect(parseSelfTestValue('plank', '121')).toBeNull()
    expect(parseSelfTestValue('plank', '45.5')).toBeNull()
    expect(parseSelfTestValue('plank', '-3')).toBeNull()
    expect(parseSelfTestValue('long_jump', '9')).toBeNull()
    expect(parseSelfTestValue('long_jump', '150')).toBe(150)
    expect(parseSelfTestValue('juggling', '')).toBeNull()
    expect(parseSelfTestValue('juggling', '1e3')).toBeNull()
  })

  it('close the long jump under 12 and without a birth date', () => {
    const open = (birth: string | null) => Object.fromEntries(testsFor(birth, '2026-11-11').map(item => [item.key, item.open]))
    expect(open('2015-11-12')).toEqual({ juggling: true, plank: true, long_jump: false })
    expect(open('2014-11-11')).toEqual({ juggling: true, plank: true, long_jump: true })
    expect(open(null)).toEqual({ juggling: true, plank: true, long_jump: false })
  })

  it('compare the latest result with the one before and say when the next is due', () => {
    const rows = [
      { test_key: 'juggling' as const, value: 12, test_date: '2026-10-01' },
      { test_key: 'juggling' as const, value: 20, test_date: '2026-10-29' },
      { test_key: 'plank' as const, value: 60, test_date: '2026-10-29' },
    ]
    const juggling = selfTestSummary(rows, 'juggling', '2026-11-11')
    expect(juggling.latest?.value).toBe(20)
    expect(juggling.previous?.value).toBe(12)
    expect(juggling.change).toBe(8)
    expect(juggling.nextDue).toBe('2026-11-26')
    expect(juggling.due).toBe(false)
    const jump = selfTestSummary(rows, 'long_jump', '2026-11-11')
    expect(jump.latest).toBeNull()
    expect(jump.change).toBeNull()
    expect(jump.due).toBe(true)
    expect(selfTestSummary(rows, 'plank', '2026-10-29').testedToday).toBe(true)
  })

  it('accept only real calendar days as a history cursor, and build the history path', () => {
    expect(isCalendarDay('2026-11-13')).toBe(true)
    expect(isCalendarDay('2024-02-29')).toBe(true)
    expect(isCalendarDay('2026-02-29')).toBe(false)
    expect(isCalendarDay('2026-13-45')).toBe(false)
    expect(isCalendarDay("2026-01-01' or 1=1")).toBe(false)
    expect(isCalendarDay(['2026-11-13'])).toBe(false)
    expect(selfTestHistoryPath('plank')).toBe('/progress/tests/history?test=plank')
    expect(selfTestHistoryPath('plank', '2026-10-01')).toBe('/progress/tests/history?test=plank&before=2026-10-01')
  })

  it('remind the athlete only of tests that are open to them and due', () => {
    const today = '2026-11-13'
    // Never tested, aged 14: all three, first time.
    expect(selfTestReminder([], '2012-01-01', today)).toEqual({ due: ['juggling', 'plank', 'long_jump'], firstTime: true })
    // Under 12: the long jump never counts; a long-jump row from before (a birth date changed
    // since) does not make it a "not first" time either.
    expect(selfTestReminder([], '2016-01-01', today)?.due).toEqual(['juggling', 'plank'])
    expect(selfTestReminder([{ test_key: 'long_jump', value: 150, test_date: '2026-11-01' }], '2016-01-01', today)?.firstTime).toBe(true)
    // Tested 10 days ago: not due; 28 days ago: due again.
    const recent = [{ test_key: 'juggling' as const, value: 20, test_date: '2026-11-03' }, { test_key: 'plank' as const, value: 40, test_date: '2026-10-16' }]
    expect(selfTestReminder(recent, '2016-01-01', today)).toEqual({ due: ['plank'], firstTime: false })
    // Nothing due: no reminder at all.
    expect(selfTestReminder([...recent, { test_key: 'plank', value: 41, test_date: '2026-11-13' }], '2016-01-01', today)).toBeNull()
  })

  // What the card shows right after a save or a delete, from what the athlete just did, so it never
  // waits on the page's refresh, which Next sometimes cancels (docs/e2e.md, 14 Nov 2026).
  it('show a saved result at once: a first result, a new one, and a correction the same day', () => {
    const first = savedSelfTestSummary(selfTestSummary([], 'juggling', '2026-11-14'), 'juggling', 12, '2026-11-14')
    expect(first).toMatchObject({ latest: { value: 12, test_date: '2026-11-14' }, previous: null, change: null, testedToday: true, due: false, nextDue: '2026-12-12' })
    const before = selfTestSummary([{ test_key: 'juggling', value: 20, test_date: '2026-10-01' }], 'juggling', '2026-11-14')
    const next = savedSelfTestSummary(before, 'juggling', 25, '2026-11-14')
    expect(next).toMatchObject({ latest: { value: 25 }, previous: { value: 20 }, change: 5, testedToday: true })
    const corrected = savedSelfTestSummary(next, 'juggling', 18, '2026-11-14')
    expect(corrected).toMatchObject({ latest: { value: 18, test_date: '2026-11-14' }, previous: { value: 20 }, change: -2 })
  })

  it("show a deleted result gone at once: today's row goes, the one before becomes the latest", () => {
    const rows = [{ test_key: 'plank' as const, value: 40, test_date: '2026-10-01' }, { test_key: 'plank' as const, value: 55, test_date: '2026-11-14' }]
    const after = removedSelfTestSummary(selfTestSummary(rows, 'plank', '2026-11-14'), 'plank', '2026-11-14', '2026-11-14')
    expect(after).toMatchObject({ latest: { value: 40, test_date: '2026-10-01' }, testedToday: false, due: true })
    // Older results are not on the card, so the change waits for the page's own data.
    expect(after.change).toBeNull()
    const none = removedSelfTestSummary(selfTestSummary([rows[1]], 'plank', '2026-11-14'), 'plank', '2026-11-14', '2026-11-14')
    expect(none).toMatchObject({ latest: null, testedToday: false, due: true })
  })
})
