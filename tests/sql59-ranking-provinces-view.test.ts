import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('59-ranking-provinces-view-v1.sql')
const migration = raw.replace(/\s+/g, ' ')

// T10: one row per province instead of every ranking row. Run on Postgres 16 with
// Supabase-like roles before commit (100,000 ranks: 4 rows back, 22 ms; a mutant without
// the grant rolled back); these checks keep the file from drifting.
describe('SQL59 public_ranking_provinces view', () => {
  it('runs with the caller\'s rights and groups player_ranks by the stored province', () => {
    expect(migration).toContain('create or replace view public.public_ranking_provinces with (security_invoker = true) as select r.sport, r.season, r.province, count(*)::integer as athletes from public.player_ranks r')
    expect(migration).toContain("where r.province is not null and btrim(r.province) <> '' group by r.sport, r.season, r.province;")
  })

  it('carries no player column beyond sport, season, province and a count', () => {
    const select = migration.slice(migration.indexOf(' as select ') + 11, migration.indexOf(' from public.player_ranks r'))
    expect(select).toBe('r.sport, r.season, r.province, count(*)::integer as athletes')
  })

  it('indexes the lookup and gives readers SELECT only', () => {
    expect(migration).toContain('create index if not exists player_ranks_sport_season_province_idx on public.player_ranks (sport, season, province);')
    expect(migration).toContain('revoke all on public.public_ranking_provinces from public, anon, authenticated;')
    expect(migration).toContain('grant select on public.public_ranking_provinces to anon, authenticated, service_role;')
  })

  it('checks itself, signed out included, and rolls back on any mismatch', () => {
    expect(raw).toMatch(/^begin;/m)
    expect(raw).toMatch(/^commit;\s*$/m)
    expect(migration).toContain("raise exception 'SQL59 view missing or not security_invoker'")
    expect(migration).toContain('set local role anon;')
  })

  it.each(['59-ranking-provinces-view-precheck.sql', '59-ranking-provinces-view-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
