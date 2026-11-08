import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TRAINING_GOALS } from '@/lib/training/goals'

// sql/95-training-goals-v1.sql, read as text. Behaviour was drilled on Postgres 16 (runbook row
// 95): apply twice, the owner sets and switches goals, retries change nothing, 40 concurrent
// changes leave one current goal with no error, anon and direct writes are refused, rollback
// and reapply.
const sql = readFileSync(new URL('../sql/95-training-goals-v1.sql', import.meta.url), 'utf8')
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

describe('SQL95 training goals', () => {
  it('accepts exactly the goals the app offers, in the table and in the function', () => {
    for (const list of code.matchAll(/in \(('[a-z_]+'(?:, '[a-z_]+')*)\)/g)) {
      expect(list[1].split(', ').map(item => item.replace(/'/g, ''))).toEqual([...TRAINING_GOALS])
    }
    expect([...code.matchAll(/in \('ball_control'/g)]).toHaveLength(2)
  })

  it('keeps one current goal and stores no free text', () => {
    expect(code).toMatch(/on public\.athlete_training_goals \(athlete_id\) where ended_at is null/)
    expect(code).not.toMatch(/\bnote\b|\bdescription\b|\bcomment\b/)
  })

  it('is private, written only through the function', () => {
    expect(code).toMatch(/revoke all on public\.athlete_training_goals from public, anon, authenticated;/)
    expect(code).toMatch(/grant select on public\.athlete_training_goals to authenticated;/)
    expect(code).not.toMatch(/grant (insert|update|delete)/)
    expect(code).toMatch(/revoke all on function public\.set_my_training_goal\(text\) from public, anon;/)
    expect(code).toMatch(/set search_path = public, pg_temp/)
  })

  it('serialises changes per athlete and stamps after the lock', () => {
    expect(code).toMatch(/pg_advisory_xact_lock/)
    expect(code).toMatch(/stamp := clock_timestamp\(\)/)
    expect(code).not.toMatch(/ended_at = now\(\)/)
  })

  it('comes with a precheck, a postcheck and a rollback that says what is lost', () => {
    const down = readFileSync(new URL('../sql/95-training-goals-down.sql', import.meta.url), 'utf8')
    expect(down).toMatch(/LOSES every athlete's training goals/)
    for (const name of ['precheck', 'postcheck']) expect(readFileSync(new URL(`../sql/95-training-goals-${name}.sql`, import.meta.url), 'utf8')).toMatch(/Read-only/)
  })
})
