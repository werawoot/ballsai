import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('52-public-athlete-rankings-view-v1.sql')
const migration = raw.replace(/\s+/g, ' ')
const viewBody = migration.slice(migration.indexOf('create or replace view'), migration.indexOf(';', migration.indexOf('create or replace view')))

// /ranking's ดาวรุ่ง and MVP tabs used to read 500 public athletes in no order and rank
// only those. The view lets the database join, sort and cut, so the list is right at any
// size. Every row is a minor's data made visible to signed-out visitors, so the view must
// obey the base tables' RLS, list public profiles only, and never carry a birth date.
describe('SQL52 public_athlete_rankings view', () => {
  it('runs with the caller\'s rights, so RLS on the base tables still applies', () => {
    expect(viewBody).toMatch(/create or replace view public\.public_athlete_rankings with \(security_invoker = true\)/i)
  })

  it('lists public athlete profiles only', () => {
    expect(viewBody).toMatch(/join public\.athlete_profiles a on a\.user_id = r\.player_id and a\.sport = r\.sport and a\.is_public/i)
  })

  it('exposes an under_18 flag and no birth date or other profile field', () => {
    expect(viewBody).toMatch(/as under_18/)
    const selected = viewBody.slice(viewBody.indexOf(' as select ') + 11, viewBody.indexOf(' from public.player_ranks'))
    expect(selected).not.toMatch(/birth_date\s*,|birth_date\s*$|a\.\*|r\.\*/)
    expect(selected.match(/\ba\.[a-z_]+/g) ?? []).toEqual(['a.birth_date', 'a.birth_date'])
  })

  it('gives readers SELECT only', () => {
    expect(migration).toMatch(/revoke all on public\.public_athlete_rankings from public, anon, authenticated;/i)
    expect(migration).toMatch(/grant select on public\.public_athlete_rankings to anon, authenticated, service_role;/i)
  })

  it('checks itself and rolls back on any mismatch', () => {
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toContain('security_invoker')
    expect(migration).toMatch(/raise exception/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['52-public-athlete-rankings-view-precheck.sql', '52-public-athlete-rankings-view-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
