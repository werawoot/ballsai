import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/99-submit-team-permission-v1.sql, read as text. Behaviour was drilled on Postgres 16
// (runbook row 99): before it a stranger submitted a team of a tournament with no organizer and a
// tournament with a null status counted as open; after it both are refused and the owner, the
// tournament's organizer and an admin still submit.

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const sql = read('99-submit-team-permission-v1.sql')
const down = read('99-submit-team-permission-down.sql')
const sql20 = read('20-tournament-roster-flow-v1.sql')
const route = readFileSync(new URL('../app/api/teams/[teamId]/submit/route.ts', import.meta.url), 'utf8')

const statement = (text: string) => text.match(/create or replace function public\.submit_tournament_team_safely\([\s\S]*?\$\$([\s\S]*?)\$\$;/)!
const md5 = (text: string) => createHash('md5').update(text).digest('hex')
const SQL20_MD5 = '6cf8a5cdacf2357ac7307c771e18d5f5'
const SQL99_MD5 = '8a6bfca466d4ddeaaa38409dde9f52a6'

describe('SQL99: submitting a team never passes on a null', () => {
  const body = statement(sql)[1]

  it('treats a null permission as a refusal', () => {
    expect(body).toContain('if not coalesce(v_team.created_by = v_user_id or v_tournament.organizer_id = v_user_id or public.is_admin(), false) then')
    expect(body).not.toMatch(/if not \(v_team\.created_by/)
  })

  it('refuses a team with no tournament, after the permission check', () => {
    expect(body.indexOf("raise exception 'NOT_ALLOWED'")).toBeLessThan(body.indexOf("raise exception 'TOURNAMENT_NOT_FOUND'"))
    expect(body).toContain('v_has_tournament := found;')
  })

  it('counts only a status of exactly open as open, and only a draft team as submittable', () => {
    expect(body).toContain("if v_tournament.status is distinct from 'open' then raise exception 'TOURNAMENT_CLOSED'")
    expect(body).toContain("if v_team.status is distinct from 'draft' then raise exception 'TEAM_NOT_DRAFT'")
  })

  it('keeps every message the app maps', () => {
    for (const code of ['ACCEPTED_ROSTER_REQUIRED', 'TOURNAMENT_FULL', 'TOURNAMENT_CLOSED', 'NOT_ALLOWED']) {
      expect(route).toContain(code)
      expect(body).toContain(`'${code}'`)
    }
  })

  it('stamps its own md5, starts only from the sql/20 body, and checks itself', () => {
    expect(md5(body)).toBe(SQL99_MD5)
    expect(md5(statement(sql20)[1])).toBe(SQL20_MD5)
    expect(sql).toContain(`not in ('${SQL20_MD5}', '${SQL99_MD5}')`)
    expect(sql).toContain("raise exception 'SQL99 self-check failed'")
    expect(sql).toMatch(/\nbegin;\n[\s\S]*\ncommit;\n$/)
  })

  it('closes register_team_safely to signed-in users, where it exists', () => {
    expect(sql).toContain("if to_regprocedure('public.register_team_safely(uuid,text,text)') is not null then")
    expect(sql).toContain('revoke all on function public.register_team_safely(uuid, text, text) from public, anon, authenticated;')
  })

  it('has a rollback that puts back the sql/20 statement unchanged', () => {
    expect(statement(down)[0]).toBe(statement(sql20)[0])
    expect(down).not.toMatch(/^grant execute on function public\.register_team_safely/m)
  })
})
