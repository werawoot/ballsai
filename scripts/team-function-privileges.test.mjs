/**
 * Guards for sql/26-team-function-privileges-v1.sql.
 *
 * Postgres is not available here, so these tests assert what the migration *says*:
 * that it covers all nine Team Roster RPCs, revokes EXECUTE from `anon`, keeps it for
 * `authenticated`, changes no function body, leaves the intentionally anon-callable
 * guardian functions alone, and is safe to re-run. The privilege state itself can only
 * be proven on staging — see the verification query at the end of the migration.
 *
 *   node --test scripts/team-function-privileges.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'

const root = new URL('..', import.meta.url).pathname.replace(/\/$/, '')
const sql = readFileSync(`${root}/sql/26-team-function-privileges-v1.sql`, 'utf8')
const step24 = readFileSync(`${root}/sql/24-team-roster-integrity-v1.sql`, 'utf8')
const step25 = readFileSync(`${root}/sql/25-team-discovery-v1.sql`, 'utf8')

/**
 * Statement-level assertions run against the SQL with `--` comments stripped: the
 * header explains Supabase's default privileges and names service_role and ALTER
 * DEFAULT PRIVILEGES, and prose must not be mistaken for an executed statement.
 */
const statements = sql
  .split('\n')
  .filter(line => !line.trim().startsWith('--'))
  .join('\n')

/** name → argument types, exactly as the REVOKE/GRANT statements must spell them. */
const FUNCTIONS = [
  ['invite_team_member', 'uuid, text'],
  ['respond_team_invite', 'uuid, text'],
  ['request_team_membership', 'uuid'],
  ['approve_team_request', 'uuid'],
  ['decline_team_request', 'uuid'],
  ['remove_team_member', 'uuid, text'],
  ['list_joinable_teams', ''],
  ['list_my_team_labels', ''],
  ['record_match_result_safely', 'uuid, uuid, uuid, integer, integer, jsonb'],
]

const signatureOf = ([name, args]) => `public.${name}(${args})`

describe('every Team Roster function is covered', () => {
  it('lists all nine signatures', () => {
    assert.equal(FUNCTIONS.length, 9)
    for (const fn of FUNCTIONS) {
      assert.ok(sql.includes(`'${signatureOf(fn)}'`), `${signatureOf(fn)} must be listed`)
    }
  })

  it('lists each signature in both the apply loop and the assertion loop', () => {
    for (const fn of FUNCTIONS) {
      const occurrences = sql.split(`'${signatureOf(fn)}'`).length - 1
      assert.ok(occurrences >= 2, `${signatureOf(fn)} must appear in the apply and verify blocks`)
    }
  })

  it('spells each signature with the argument types the definitions use', () => {
    const defined = `${step24}\n${step25}`
    for (const [name, args] of FUNCTIONS) {
      const match = defined.match(new RegExp(`create or replace function public\\.${name}\\s*\\(([^)]*)\\)`, 's'))
      assert.ok(match, `${name} must be defined in step 24 or 25`)
      const declaredArity = match[1].trim() === '' ? 0 : match[1].split(',').length
      const revokedArity = args === '' ? 0 : args.split(',').length
      assert.equal(revokedArity, declaredArity, `${name} argument count must match its definition`)
    }
  })
})

describe('privileges move in the intended direction only', () => {
  it('revokes execute from anon and never from authenticated', () => {
    assert.match(sql, /revoke execute on function %s from anon/)
    assert.ok(!/revoke\s+(all|execute)[^;]*from\s+authenticated/i.test(statements), 'authenticated must keep EXECUTE')
  })

  it('re-asserts execute for authenticated', () => {
    assert.match(sql, /grant execute on function %s to authenticated/)
  })

  it('never grants anything to anon', () => {
    assert.ok(!/grant[^;]*to\s+anon/i.test(statements), 'this migration only takes EXECUTE away from anon')
  })

  it('leaves service_role alone', () => {
    assert.ok(!/service_role/.test(statements), 'no statement may re-grant or revoke service_role')
  })
})

describe('nothing but privileges changes', () => {
  it('defines or replaces no function', () => {
    assert.ok(!/create\s+(or\s+replace\s+)?function/i.test(statements), 'no function body may change here')
  })

  it('touches no table, policy, trigger or index', () => {
    for (const pattern of [/create\s+table/i, /alter\s+table/i, /drop\s+table/i, /create\s+policy/i, /drop\s+policy/i, /create\s+trigger/i, /create\s+(unique\s+)?index/i]) {
      assert.ok(!pattern.test(statements), `unexpected schema statement: ${pattern}`)
    }
  })

  it('writes no rows', () => {
    for (const pattern of [/\binsert\s+into\b/i, /\bupdate\s+public\./i, /\bdelete\s+from\b/i]) {
      assert.ok(!pattern.test(statements), `unexpected data statement: ${pattern}`)
    }
  })

  it('does not touch the functions that are anon-callable by design', () => {
    for (const name of ['confirm_guardian_verification', 'revoke_guardian_consent', 'is_admin', 'is_organizer']) {
      const mentioned = sql.split(name).length - 1
      const inCommentOnly = sql
        .split('\n')
        .filter(line => line.includes(name))
        .every(line => line.trim().startsWith('--'))
      assert.ok(mentioned === 0 || inCommentOnly, `${name} may only appear in the do-not-touch comment`)
    }
  })
})

describe('safe to re-run', () => {
  it('skips a function that is not present instead of failing', () => {
    assert.match(sql, /to_regprocedure\(v_signature\) is null/)
    assert.match(sql, /continue;/)
  })

  it('uses only idempotent privilege statements', () => {
    // REVOKE of an absent grant and GRANT of a held one are both no-ops in Postgres.
    assert.ok(!/create\s+role/i.test(statements))
    assert.ok(!/alter\s+default\s+privileges/i.test(statements), 'default privileges are Supabase-owned; do not rewrite them here')
  })

  it('runs inside one transaction', () => {
    assert.match(sql, /^begin;/m)
    assert.match(sql, /^commit;/m)
    assert.ok(sql.indexOf('begin;') < sql.indexOf('commit;'))
  })
})

describe('the migration verifies itself', () => {
  it('asserts anon has no EXECUTE and authenticated still does', () => {
    assert.match(sql, /has_function_privilege\('anon', v_signature, 'EXECUTE'\)/)
    assert.match(sql, /not has_function_privilege\('authenticated', v_signature, 'EXECUTE'\)/)
  })

  it('raises rather than committing a half-applied state', () => {
    assert.match(sql, /raise exception 'TEAM_FUNCTION_PRIVILEGES_NOT_APPLIED/)
    assert.ok(
      sql.indexOf('TEAM_FUNCTION_PRIVILEGES_NOT_APPLIED') < sql.indexOf('\ncommit;'),
      'the assertion must run before COMMIT so a failure rolls back',
    )
  })

  it('ships a post-apply verification query for all nine', () => {
    const verification = sql.slice(sql.indexOf('Post-apply verification'))
    assert.match(verification, /has_function_privilege\('anon'/)
    assert.match(verification, /has_function_privilege\('authenticated'/)
    for (const fn of FUNCTIONS) {
      assert.ok(verification.includes(signatureOf(fn)), `${signatureOf(fn)} must be in the verification query`)
    }
  })
})
