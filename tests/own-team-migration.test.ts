import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// SQL78 (docs/coach-own-team-v1.md): a coach's own team with no tournament, entering a
// tournament from it, and the owner's decisions D1-D4. Behaviour is proven in the Postgres
// sandbox (runbook row 78); this pins the parts a later edit must not lose.
const sql = readFileSync('sql/78-own-team-v1.sql', 'utf8')
const body = sql.replace(/--[^\n]*/g, '')

describe('sql/78 own team', () => {
  it('lets a club team have no tournament, and an entry always have one', () => {
    expect(body).toContain('alter table public.teams alter column tournament_id drop not null')
    expect(body).toMatch(/\(kind = 'entry' and tournament_id is not null\) or \(kind = 'club' and tournament_id is null and status = 'draft'\)/)
  })

  it('creates a team idempotently, for coaches only, at most 20 each, serialised per coach', () => {
    expect(body).toMatch(/on conflict \(id\) do nothing/)
    expect(body).toContain("'COACH_ORGANIZER_REQUIRED'")
    expect(body).toMatch(/>= 20 then\s+raise exception 'TOO_MANY_TEAMS'/)
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('create_my_team:'")
  })

  it('enters only accepted members, once per tournament, and tells each athlete and guardian (D1)', () => {
    expect(body).toContain("'ATHLETE_NOT_ON_TEAM'")
    expect(body).toContain("'ATHLETE_ALREADY_ON_TOURNAMENT_ROSTER'")
    expect(body).toMatch(/if v_existing\.source_team_id = p_team_id then return v_existing\.id/)
    expect(body).toMatch(/from public\.guardian_links g where g\.athlete_id = v_athlete and g\.status = 'accepted'/)
  })

  it('lets only the athlete or an accepted guardian withdraw, and only before submitting (D1)', () => {
    expect(body).toMatch(/v_member\.athlete_id = v_user or exists \(\s+select 1 from public\.guardian_links g/)
    expect(body).toContain("'ROSTER_LOCKED'")
  })

  it('asks old members again when an old team is kept (D2)', () => {
    const keep = body.slice(body.indexOf('function public.keep_as_my_team'))
    expect(keep).toMatch(/values \(v_club, v_row\.athlete_id, v_user, 'pending'\)/)
  })

  it('keeps every function away from anon and checks itself before commit', () => {
    for (const fn of ['create_my_team(uuid, text)', 'enter_tournament_from_team(uuid, uuid, uuid[])', 'withdraw_from_entry(uuid)', 'keep_as_my_team(uuid)', 'my_entry_rosters(integer)']) {
      expect(body).toContain(`revoke all on function public.${fn} from public, anon`)
    }
    expect(body).toContain('SQL78 privileges are wider than intended')
    expect(body.trim().endsWith('commit;')).toBe(true)
  })

  it('pastes cleanly from chat: no asterisk or backslash', () => {
    for (const file of ['sql/78-own-team-v1.sql', 'sql/78-own-team-precheck.sql', 'sql/78-own-team-postcheck.sql']) {
      expect(readFileSync(file, 'utf8').replace(/--[^\n]*/g, '')).not.toMatch(/[*\\]/)
    }
  })
})
