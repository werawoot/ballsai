import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('57-public-fixtures-v1.sql')
const migration = raw.replace(/\s+/g, ' ')
const body = (name: string) => migration.slice(migration.indexOf(`function public.${name}(`), migration.indexOf('$$;', migration.indexOf(`function public.${name}(`)))

// Team names are not public today. A draw becomes public only when its organizer
// publishes it, and then only what a fixture list needs: names, scores, the order.
describe('SQL57 public fixtures', () => {
  it('records when a draw was published, switched only by the organizer or an admin', () => {
    expect(migration).toMatch(/alter table public\.tournaments add column if not exists fixtures_published_at timestamptz/)
    const toggle = body('set_fixtures_published_safely')
    expect(toggle).toContain('public.is_admin()')
    expect(toggle).toContain("'NOT_ALLOWED'")
    expect(toggle).toMatch(/for update/)
  })

  it('returns nothing for a draw that is not published', () => {
    expect(body('public_tournament_fixtures')).toMatch(/fixtures_published_at is not null/)
  })

  it('returns names, scores and registration order, and nothing about team members', () => {
    const reader = body('public_tournament_fixtures')
    expect(reader).toMatch(/home_name text/)
    expect(reader).toMatch(/home_score integer/)
    expect(reader).toMatch(/team_order/)
    expect(reader).not.toMatch(/members|created_by|team_members|profiles|athlete/)
    expect(reader).toMatch(/m\.status = 'confirmed'/)
  })

  it('opens only the reader to signed-out visitors, on purpose, after SQL50', () => {
    expect(migration).toMatch(/grant execute on function public\.public_tournament_fixtures\(uuid\) to anon, authenticated/)
    expect(migration).toMatch(/revoke all on function public\.set_fixtures_published_safely\(uuid, boolean\) from public, anon, service_role/)
    expect(migration).toMatch(/grant execute on function public\.set_fixtures_published_safely\(uuid, boolean\) to authenticated/)
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toMatch(/raise exception 'SQL57/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['57-public-fixtures-precheck.sql', '57-public-fixtures-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
