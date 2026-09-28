import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('56-fixture-results-v1.sql')
const migration = raw.replace(/\s+/g, ' ')
const body = (name: string) => migration.slice(migration.indexOf(`function public.${name}(`), migration.indexOf('$$;', migration.indexOf(`function public.${name}(`)))

// A recorded result finds its fixture and moves the draw on: knockout winners advance,
// a finished group fills its qualifying places. Voiding a result undoes that, and is
// refused when a later match already used it. All in the database, in the same
// transaction as the result, so the draw can never disagree with the results.
describe('SQL56 results drive the draw', () => {
  it('keeps where a side came from when the team is filled in', () => {
    expect(migration).toMatch(/add column winner_team_id uuid references public\.teams\(id\)/)
    expect(migration).toMatch(/check \(home_team_id is not null or home_source is not null\)/)
    expect(migration).toMatch(/check \(away_team_id is not null or away_source is not null\)/)
  })

  it('links a new confirmed result to the earliest open fixture with the same two teams', () => {
    const link = body('link_fixture_on_result')
    expect(link).toMatch(/new\.status <> 'confirmed'/)
    expect(link).toMatch(/match_result_id is null/)
    expect(link).toMatch(/order by case f\.stage when 'group' then 1 when 'league' then 2 else 3 end, f\.round, f\.fixture_key/)
    expect(link).toMatch(/for update/)
    expect(migration).toMatch(/after insert on public\.match_results for each row execute function public\.link_fixture_on_result\(\)/)
  })

  it('serializes every change to a draw on the tournament row', () => {
    for (const name of ['link_fixture_on_result', 'unlink_fixture_on_void', 'set_fixture_winner_safely']) {
      expect(body(name)).toMatch(/from public\.tournaments t where t\.id = [a-z_.]+ for update/)
    }
  })

  it('ranks a finished group by points, goal difference, goals, then registration order', () => {
    const fill = body('fill_group_places')
    expect(fill).toMatch(/order by points desc, goal_difference desc, goals_for desc, created_at, team_id/)
    expect(fill).toMatch(/status = 'confirmed'/)
  })

  it('refuses to void a result a later match already depends on', () => {
    const unlink = body('unlink_fixture_on_void')
    expect(unlink).toContain("'FIXTURE_ALREADY_ADVANCED'")
    expect(migration).toMatch(/after update of status on public\.match_results for each row when \(new\.status = 'void' and old\.status is distinct from 'void'\) execute function public\.unlink_fixture_on_void\(\)/)
  })

  it('lets only the organizer or an admin pick a knockout winner after a draw', () => {
    const winner = body('set_fixture_winner_safely')
    expect(winner).toContain('public.is_admin()')
    expect(winner).toContain("'NOT_ALLOWED'")
    expect(winner).toContain("'NOT_A_DRAWN_KNOCKOUT'")
    expect(migration).toMatch(/grant execute on function public\.set_fixture_winner_safely\(uuid, text, uuid\) to authenticated/)
  })

  it('keeps trigger functions away from every client and checks itself', () => {
    for (const name of ['link_fixture_on_result', 'unlink_fixture_on_void', 'fill_group_places', 'advance_fixture_winner']) {
      expect(migration).toMatch(new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated, service_role`))
    }
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toMatch(/raise exception 'SQL56/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['56-fixture-results-precheck.sql', '56-fixture-results-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
