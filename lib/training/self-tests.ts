import { ageOn } from '@/lib/athlete-private'

// The three self-tests the owner chose on 10 Nov 2026 (docs/research/self-tests-2026-11-10.md,
// ADR-015). Results are the athlete's own numbers: compared only with their own last result,
// labelled as self-entered, never ranked, never on the card, never in the skill score (AGENTS.md
// rule 8). sql/96-athlete-self-tests-v1.sql enforces the same limits; keep both in step.
//
// Hidden until a licensed coach or physiotherapist signs off the protocols (owner, 11 Nov 2026):
// the pages show only where NEXT_PUBLIC_SELF_TESTS is exactly "true" (Staging for testing).
// Careful defaults until the coach answers the open questions: plank stops at 2 minutes, and
// the standing long jump is for athletes 12 and over only.

export const SELF_TEST_KEYS = ['juggling', 'plank', 'long_jump'] as const
export type SelfTestKey = typeof SELF_TEST_KEYS[number]

export type SelfTestSpec = {
  key: SelfTestKey
  unit: 'touches' | 'seconds' | 'cm'
  min: number
  max: number
  attempts: number
  minAge: number | null
}

export const SELF_TESTS: Record<SelfTestKey, SelfTestSpec> = {
  juggling: { key: 'juggling', unit: 'touches', min: 0, max: 1000, attempts: 3, minAge: null },
  plank: { key: 'plank', unit: 'seconds', min: 0, max: 120, attempts: 1, minAge: null },
  long_jump: { key: 'long_jump', unit: 'cm', min: 10, max: 400, attempts: 2, minAge: 12 },
}

export const SELF_TEST_EVERY_DAYS = 28

export const selfTestsEnabled = () => process.env.NEXT_PUBLIC_SELF_TESTS === 'true'

export const isSelfTestKey = (value: unknown): value is SelfTestKey =>
  typeof value === 'string' && (SELF_TEST_KEYS as readonly string[]).includes(value)

// A whole number inside the test's range, or null. The database checks the same bounds.
export function parseSelfTestValue(key: SelfTestKey, raw: string): number | null {
  const text = raw.trim()
  if (!/^\d{1,4}$/.test(text)) return null
  const value = Number(text)
  const spec = SELF_TESTS[key]
  return value >= spec.min && value <= spec.max ? value : null
}

// Which tests this athlete may do. Without a birth date the age-limited test stays closed.
export function testsFor(birthDate: string | null, today: string): { key: SelfTestKey; open: boolean }[] {
  const age = birthDate ? ageOn(birthDate, today) : null
  return SELF_TEST_KEYS.map(key => {
    const minAge = SELF_TESTS[key].minAge
    return { key, open: minAge === null || (age !== null && age >= minAge) }
  })
}

export type SelfTestResult = { test_key: SelfTestKey; value: number; test_date: string }

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

// The latest result against the one before it, and when the next test is due. Rows are this
// athlete's own, newest first; a repeated date counts once (the database keeps one per day).
export function selfTestSummary(rows: SelfTestResult[], key: SelfTestKey, today: string) {
  const seen = new Set<string>()
  const mine = rows
    .filter(row => row.test_key === key && !seen.has(row.test_date) && seen.add(row.test_date))
    .sort((a, b) => b.test_date.localeCompare(a.test_date))
  const latest = mine[0] ?? null
  const previous = mine[1] ?? null
  const nextDue = latest ? addDays(latest.test_date, SELF_TEST_EVERY_DAYS) : today
  return {
    latest,
    previous,
    change: latest && previous ? latest.value - previous.value : null,
    nextDue,
    due: nextDue <= today,
    testedToday: latest?.test_date === today,
  }
}
