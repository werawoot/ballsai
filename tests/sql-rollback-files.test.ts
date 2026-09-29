import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const dir = new URL('../sql/rollback/', import.meta.url)
const files = readdirSync(dir).filter(name => name.endsWith('.sql'))
const code = (name: string) => readFileSync(new URL(name, dir), 'utf8').split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n').replace(/\s+/g, ' ')
const raw = (name: string) => readFileSync(new URL(name, dir), 'utf8')

// T31: prepared rollbacks for the pending migrations, drilled on Postgres 16 (apply,
// roll back, apply again; a second rollback refused). These checks keep them safe to
// reach for in an incident: all-or-nothing, never run twice, and never dropping data a
// file does not say it drops.
describe('rollback files', () => {
  it('covers the migrations the plan says can be rolled back', () => {
    expect(files.sort()).toEqual([
      '57-public-fixtures-down.sql', '58-athlete-private-columns-down.sql',
      '59-ranking-provinces-view-down.sql', '60-match-result-request-id-down.sql',
      '61-first-match-rank-down.sql',
    ])
    const plan = readFileSync(new URL('../docs/rollback-plan.md', import.meta.url), 'utf8')
    for (const name of files) expect(plan).toContain(`sql/rollback/${name}`)
  })

  it.each(files)('%s runs all-or-nothing, marked for incidents only', name => {
    expect(raw(name)).toMatch(/INCIDENT USE ONLY/)
    expect(code(name)).toMatch(/^ ?begin;/)
    expect(code(name).trim()).toMatch(/commit;$/)
    expect(code(name)).toMatch(/raise exception/)
  })

  it.each(files.filter(name => !name.startsWith('59')))('%s refuses to run when its migration is not applied', name => {
    expect(code(name)).toMatch(/is not applied here: nothing to roll back/)
  })

  it('drops only what its migration created, and says what is lost', () => {
    const tables = files.flatMap(name => [...code(name).matchAll(/drop table (\S+)/g)].map(match => `${name}: ${match[1]}`))
    expect(tables).toEqual(['60-match-result-request-id-down.sql: public.match_result_submissions;'])
    expect(files.some(name => /\b(delete from|truncate)\b/i.test(code(name)))).toBe(false)
    expect(raw('57-public-fixtures-down.sql')).toMatch(/LOSES which tournaments were published/)
    expect(raw('58-athlete-private-columns-down.sql')).toMatch(/puts back the leak/)
  })
})
