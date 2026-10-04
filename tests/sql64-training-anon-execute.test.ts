import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/64: SQL63 revoked its functions from PUBLIC only, which left anon's direct grant
// (Supabase default privileges, before SQL50) on Production. Drilled on Postgres 16
// with those defaults (runbook row 64).
const sql = readFileSync(new URL('../sql/64-training-anon-execute-revoke-v1.sql', import.meta.url), 'utf8')
const code = sql.split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

describe('SQL64 training anon execute revoke', () => {
  it('revokes both callable training functions from anon by name, not only from public', () => {
    expect(code).toMatch(/revoke all on function public\.training_self_start_programs\(\) from public, anon;/)
    expect(code).toMatch(/revoke all on function public\.training_today\(\) from public, anon;/)
    expect(code).not.toMatch(/to anon/)
  })

  it('keeps signed-in athletes able to start and check in', () => {
    expect(code).toMatch(/grant execute on function public\.training_self_start_programs\(\) to authenticated;/)
    expect(code).toMatch(/grant execute on function public\.training_today\(\) to authenticated;/)
  })

  it('runs all-or-nothing, refuses without SQL63, and checks its own result', () => {
    expect(code.trim()).toMatch(/^begin;/)
    expect(code.trim()).toMatch(/commit;$/)
    expect(code).toMatch(/SQL63 is not applied here/)
    expect(code).toMatch(/has_function_privilege\('anon', 'public\.training_enrollments_limit\(\)', 'execute'\)/)
    expect(code).toMatch(/SQL64: authenticated lost execute/)
  })
})
