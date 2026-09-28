import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('55-tournament-fixtures-v1.sql')
const migration = raw.replace(/\s+/g, ' ')
const rpc = migration.slice(migration.indexOf('function public.save_tournament_fixtures_safely'))

// An organizer's draw (lib/fixtures.ts) is stored as one row per fixture. Only the
// tournament's organizer or an admin may replace it, only through one checked function,
// never once a result has been recorded, and only with that tournament's confirmed teams.
describe('SQL55 tournament fixtures', () => {
  it('stores one row per fixture, unique by key within a tournament', () => {
    expect(migration).toMatch(/create table public\.tournament_fixtures/)
    expect(migration).toMatch(/unique \(tournament_id, fixture_key\)/)
    expect(migration).toMatch(/stage text not null check \(stage in \('knockout', 'league', 'group'\)\)/)
    expect(migration).toMatch(/references public\.tournaments\(id\) on delete cascade/)
  })

  it('lets clients read their own tournament\'s fixtures and write nothing directly', () => {
    expect(migration).toMatch(/alter table public\.tournament_fixtures enable row level security/)
    expect(migration).toMatch(/revoke all on public\.tournament_fixtures from public, anon, authenticated/)
    expect(migration).toMatch(/grant select on public\.tournament_fixtures to authenticated/)
    expect(migration).toMatch(/for select to authenticated using \(/)
    expect(migration).not.toMatch(/grant (insert|update|delete|all)[^;]*tournament_fixtures to authenticated/i)
  })

  it('replaces a draw only for the organizer or an admin, one request at a time', () => {
    expect(rpc).toContain('auth.uid()')
    expect(rpc).toContain('public.is_admin()')
    expect(rpc).toMatch(/for update/)
    expect(rpc).toContain("'NOT_ALLOWED'")
  })

  it('refuses a new draw once a fixture has a result, and teams that are not confirmed here', () => {
    expect(rpc).toContain("'FIXTURES_HAVE_RESULTS'")
    expect(rpc).toContain("'TEAM_NOT_CONFIRMED")
    expect(rpc).toMatch(/status = 'confirmed'/)
    expect(rpc).toContain("'FIXTURE_SOURCE_INVALID")
    expect(rpc).toContain("'TOO_MANY_FIXTURES'")
  })

  it('runs as a definer with a fixed search_path, for signed-in users only, and checks itself', () => {
    expect(rpc).toMatch(/security definer set search_path = ''/)
    expect(migration).toMatch(/revoke all on function public\.save_tournament_fixtures_safely\(uuid, jsonb\) from public, anon/)
    expect(migration).toMatch(/grant execute on function public\.save_tournament_fixtures_safely\(uuid, jsonb\) to authenticated/)
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toMatch(/raise exception 'SQL55/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['55-tournament-fixtures-precheck.sql', '55-tournament-fixtures-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
