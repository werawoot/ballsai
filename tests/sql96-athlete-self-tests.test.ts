import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { SELF_TEST_KEYS, SELF_TESTS } from '@/lib/training/self-tests'

// sql/96-athlete-self-tests-v1.sql, read as text. Behaviour was drilled on Postgres 16 (runbook
// row 96): 24 cases including bounds, the long-jump age rule, same-day correction, private
// reads, refused direct writes, PDPA cascade and 40 concurrent entries leaving one row.
const sql = readFileSync(new URL('../sql/96-athlete-self-tests-v1.sql', import.meta.url), 'utf8')
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

describe('SQL96 athlete self-tests', () => {
  it('accepts exactly the tests the app offers, in the table and in the function', () => {
    const lists = [...code.matchAll(/in \(('[a-z_]+'(?:, '[a-z_]+')*)\)/g)].map(match => match[1].split(', ').map(item => item.replace(/'/g, '')))
    expect(lists).toHaveLength(2)
    for (const list of lists) expect(list).toEqual([...SELF_TEST_KEYS])
  })

  it('keeps the same ranges as the app, in the table and in the function', () => {
    for (const key of SELF_TEST_KEYS) {
      const { min, max } = SELF_TESTS[key]
      expect(code).toContain(`test_key = '${key}' and value between ${min} and ${max}`)
      expect(code).toContain(`p_test = '${key}' and p_value not between ${min} and ${max}`)
    }
  })

  it('opens the long jump from the same age as the app, and only with a birth date', () => {
    expect(code).toContain(`born is null or born > (today - interval '${SELF_TESTS.long_jump.minAge} years')`)
  })

  it('keeps one result per test per day, dated by the database in Thailand time', () => {
    expect(code).toMatch(/unique \(athlete_id, test_key, test_date\)/)
    expect(code).toMatch(/on conflict \(athlete_id, test_key, test_date\)/)
    expect(code).toMatch(/now\(\) at time zone 'Asia\/Bangkok'/)
    expect(code).not.toMatch(/p_date date\)\s*returns date/)
    expect(code).not.toMatch(/\bnote\b|\bcomment\b|\bpain\b/)
  })

  it('is private, written only through the two functions', () => {
    expect(code).toMatch(/revoke all on public\.athlete_self_tests from public, anon, authenticated;/)
    expect(code).toMatch(/grant select on public\.athlete_self_tests to authenticated;/)
    expect(code).not.toMatch(/grant (insert|update|delete)/)
    expect(code).toMatch(/revoke all on function public\.record_my_self_test\(text, integer\) from public, anon;/)
    expect(code).toMatch(/revoke all on function public\.delete_my_self_test\(text, date\) from public, anon;/)
    expect([...code.matchAll(/set search_path = public, pg_temp/g)]).toHaveLength(2)
    expect(code).toMatch(/on delete cascade/)
  })

  it('comes with a precheck, a postcheck and a rollback that says what is lost', () => {
    const down = readFileSync(new URL('../sql/96-athlete-self-tests-down.sql', import.meta.url), 'utf8')
    expect(down).toMatch(/LOSES every athlete's self-test/)
    for (const name of ['precheck', 'postcheck']) expect(readFileSync(new URL(`../sql/96-athlete-self-tests-${name}.sql`, import.meta.url), 'utf8')).toMatch(/Read-only/)
  })
})
