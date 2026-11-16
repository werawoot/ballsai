import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/98-tournament-roster-functions-v1.sql, read as text. Behaviour was drilled on Postgres 16 in
// a database shaped like Staging (runbook row 98): registration, submit, capacity, the payment
// and performance guards, the refusals, rollback and a second apply.

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const sql = read('98-tournament-roster-functions-v1.sql')
const sql20 = read('20-tournament-roster-flow-v1.sql')
const down = read('98-tournament-roster-functions-down.sql')

const NAMES = ['create_tournament_team_safely', 'submit_tournament_team_safely', 'assert_match_performance_roster_member', 'assert_payment_team_is_pending']
// md5 of each function's source on Production (read-only check, 16 Nov 2026).
const PRODUCTION_MD5: Record<string, string> = {
  create_tournament_team_safely: '0fe734aba21070e7a7a188b310ba4503',
  submit_tournament_team_safely: '6cf8a5cdacf2357ac7307c771e18d5f5',
  assert_match_performance_roster_member: 'ba43ed37a7fa6f627b31fa7a80b1f61a',
  assert_payment_team_is_pending: '112c4dd54e79b40114f6f330918ab06a',
}

function bodies(text: string) {
  const found: Record<string, string> = {}
  for (const match of text.matchAll(/create or replace function public\.(\w+)\([\s\S]*?\$\$([\s\S]*?)\$\$;/g)) found[match[1]] = match[2]
  return found
}
const md5 = (text: string) => createHash('md5').update(text).digest('hex')

describe('SQL98: the missing parts of sql/20 on Staging', () => {
  it('creates exactly the four functions, with the bodies of sql/20 and Production', () => {
    const mine = bodies(sql)
    const original = bodies(sql20)
    expect(Object.keys(mine).sort()).toEqual([...NAMES].sort())
    for (const name of NAMES) {
      expect(mine[name]).toBe(original[name])
      expect(md5(mine[name])).toBe(PRODUCTION_MD5[name])
      expect(sql).toContain(`'${name}', '${PRODUCTION_MD5[name]}'`)
    }
  })

  it('leaves the teams constraint, invite_team_member and register_team_safely alone', () => {
    expect(sql).not.toMatch(/alter table|drop constraint|add constraint|set default/i)
    expect(sql).not.toMatch(/function public\.invite_team_member|register_team_safely\(/)
  })

  it('gives Production grants: no PUBLIC or anon, execute for authenticated and service_role', () => {
    for (const name of NAMES) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon;`))
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated, service_role;`))
    }
  })

  it('adds both triggers, before insert', () => {
    expect(sql).toContain('create trigger match_performance_roster_guard\nbefore insert on public.match_player_performances')
    expect(sql).toContain('create trigger payment_team_pending_guard\nbefore insert on public.payments')
  })

  it('stops on a missing prerequisite, a wrong status check or a different body, in one transaction', () => {
    expect(sql).toMatch(/^begin;[\s\S]*commit;\s*$/m)
    expect(sql).toContain("raise exception 'SQL98 needs")
    expect(sql).toContain("raise exception 'SQL98: teams_status_check does not allow draft and pending'")
    expect(sql).toContain('exists with another body')
    expect(sql).toContain("raise exception 'SQL98 self-check failed'")
  })

  it('has a rollback that drops only what it added', () => {
    expect(down.match(/^drop (function|trigger)/gm)).toHaveLength(6)
    for (const name of NAMES) expect(down).toContain(`drop function if exists public.${name}(`)
    expect(down).not.toMatch(/cascade/i)
  })
})
