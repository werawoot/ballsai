import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// sql/100-team-status-not-null-v1.sql, read as text. Behaviour was drilled on Postgres 16 in a
// database shaped like Production (runbook row 100): before it a tournament with a null status and
// a team with no owner were accepted and a coach registered in that tournament; after it no insert
// or update can write those nulls, the defaults still fill an omitted status, and the normal paths
// still work.

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const sql = read('100-team-status-not-null-v1.sql')
const down = read('100-team-status-not-null-down.sql')
const statements = (text: string) => text.split('\n').filter(line => line.trim() && !line.trim().startsWith('--')).join('\n')

describe('SQL100: team and tournament status and team owner can no longer be null', () => {
  it('makes exactly the three columns NOT NULL, in one transaction', () => {
    expect(sql).toMatch(/\nbegin;\n[\s\S]*\ncommit;\n$/)
    const alters = statements(sql).match(/^alter table .*$/gm)
    expect(alters).toEqual([
      'alter table public.teams alter column status set not null;',
      'alter table public.teams alter column created_by set not null;',
      'alter table public.tournaments alter column status set not null;',
    ])
  })

  it('changes nothing else: no default, check, policy, grant or function', () => {
    expect(statements(sql)).not.toMatch(/set default|add constraint|drop constraint|create policy|grant |revoke |create or replace function/i)
  })

  it('stops before any change when a row holds a null, and checks itself after', () => {
    expect(sql.indexOf("raise exception 'SQL100: a team or tournament row holds a null")).toBeLessThan(sql.indexOf('alter table public.teams'))
    expect(sql).toContain('where status is null or created_by is null')
    expect(sql).toContain('from public.tournaments where status is null')
    expect(sql).toContain("raise exception 'SQL100 self-check failed'")
  })

  it('has a rollback that, as written, keeps the status rules Staging already had', () => {
    expect(statements(down).match(/^alter table .*$/gm)).toEqual(['alter table public.teams alter column created_by drop not null;'])
    expect(down).toContain('--   alter table public.teams alter column status drop not null;')
    expect(down).toContain('--   alter table public.tournaments alter column status drop not null;')
  })
})
