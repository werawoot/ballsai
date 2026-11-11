import { afterEach, describe, expect, it } from 'vitest'
import { parseSelfTestValue, selfTestSummary, selfTestsEnabled, testsFor, SELF_TEST_KEYS, SELF_TESTS } from '@/lib/training/self-tests'

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
})
