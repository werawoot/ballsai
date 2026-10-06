import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/65 replaces the void RPC of match-result-void-v1, whose permission test let NULL
// through: a caller without a profile, or a tournament without an organizer.
const code = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const fixed = code('../sql/65-match-result-void-null-safe-v1.sql')
const original = code('../sql/match-result-void-v1.sql')

describe('SQL65 void permission check', () => {
  it('refuses a missing role and compares the organizer null-safely', () => {
    expect(fixed).toMatch(/if v_role is null or v_role not in \('organizer', 'admin'\)\s+or \(v_role <> 'admin' and v_organizer_id is distinct from v_user_id\) then/)
    expect(fixed).not.toMatch(/v_organizer_id <> v_user_id/)
  })

  it('changes nothing else in the function body', () => {
    const body = (sql: string) => sql.slice(sql.indexOf('begin;'), sql.indexOf('revoke all on function'))
    const normalise = (sql: string) => body(sql).replace(/if v_role[\s\S]*?then/, 'CHECK').replace(/\s+/g, ' ')
    expect(normalise(fixed)).toBe(normalise(original))
  })

  it('closes the function to anon and service_role and proves it before committing', () => {
    expect(fixed).toMatch(/revoke all on function public\.void_match_result_safely\(uuid\) from public, anon, service_role;/)
    expect(fixed).toMatch(/SQL65: void_match_result_safely privileges are wrong/)
    expect(fixed.trim()).toMatch(/commit;$/)
  })
})
