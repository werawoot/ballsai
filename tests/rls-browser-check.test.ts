import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { browserCheckSource, STAGING_REF } from '../scripts/rls-browser-check.mjs'
import { TRAINING_TABLES } from '../scripts/rls-minor-checks.mjs'

// T21: the browser version of the minors'-data checks, run by the owner (through Claude in
// Chrome) on the Staging site while signed in as each role, so no JWT is ever copied anywhere.

const committed = readFileSync(new URL('../docs/security/rls-browser-check.js', import.meta.url), 'utf8')
const ATHLETE = '22222222-2222-4222-8222-222222222222'
const GUARDIAN = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'
const b64url = (value: string) => Buffer.from(value).toString('base64url')
const jwtFor = (sub: string) => `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify({ sub }))}.secret-signature`

type Call = { url: string; auth: string | null }
async function run({ role, sub, athleteId = '', chunked = false, rows = 1, link = true }: { role: string; sub?: string; athleteId?: string; chunked?: boolean; rows?: number; link?: boolean }) {
  const token = sub ? jwtFor(sub) : ''
  const session = 'base64-' + b64url(JSON.stringify({ access_token: token }))
  const name = `sb-${STAGING_REF}-auth-token`
  const cookie = !sub ? '' : chunked
    ? `${name}.0=${encodeURIComponent(session.slice(0, 20))}; other=1; ${name}.1=${encodeURIComponent(session.slice(20))}`
    : `${name}=${encodeURIComponent(session)}`
  const calls: Call[] = []
  const logs: string[] = []
  const fetch = async (url: string, options: { headers: Record<string, string> }) => {
    calls.push({ url, auth: options.headers.authorization ?? null })
    const publicName = url.includes('select=user_id,display_name&is_public=eq.true')
    const body = url.includes('/guardian_links?select=athlete_id') ? (link ? [{ athlete_id: ATHLETE }] : []) : publicName ? [{ user_id: OTHER }] : Array.from({ length: rows }, () => ({ athlete_id: ATHLETE }))
    return { status: 200, text: async () => JSON.stringify(body) }
  }
  const console = { log: (...args: unknown[]) => logs.push(args.map(String).join(' ')), error: (...args: unknown[]) => logs.push(args.map(String).join(' ')), warn: (...args: unknown[]) => logs.push(args.map(String).join(' ')), table: (rows: unknown) => logs.push(JSON.stringify(rows)) }
  const source = browserCheckSource()
    .replace("const ROLE = 'anonymous'", `const ROLE = '${role}'`)
    .replace("const ATHLETE_ID = ''", `const ATHLETE_ID = '${athleteId}'`)
    .replace("const ANON_KEY = ''", "const ANON_KEY = 'public-anon-key'")
  const body = source.slice(source.indexOf('(async () =>'))
  await new Function('document', 'fetch', 'console', 'atob', `return ${body}`)({ cookie }, fetch, console, (value: string) => Buffer.from(value, 'base64').toString('binary'))
  return { calls, logs: logs.join('\n'), token }
}

describe('the browser RLS check (T21)', () => {
  it('is committed exactly as the generator writes it', () => {
    expect(committed).toBe(browserCheckSource())
  })

  it('talks to Staging only', () => {
    expect(committed).toContain(`https://' + REF + '.supabase.co/rest/v1`)
    expect(committed).toContain(`const REF = '${STAGING_REF}'`)
    expect(committed).not.toContain('hivedzrwrrcnjrlirhtv')
  })

  it('signed out: sweeps the private tables, including the training ones, with no token', async () => {
    const { calls, logs } = await run({ role: 'anonymous', rows: 0 })
    expect(calls.every(call => call.auth === null)).toBe(true)
    for (const table of TRAINING_TABLES) expect(calls.some(call => call.url.includes(`/${table}?select=*&limit=1`))).toBe(true)
    expect(logs).toMatch(/ROLE anonymous: PASS \d+, FAIL 0/)
  })

  it("owner: reads with the browser's own sign-in (split cookie too), never prints the token, and prints the athlete id", async () => {
    const { calls, logs, token } = await run({ role: 'owner', sub: ATHLETE, chunked: true })
    expect(calls.every(call => call.auth === `Bearer ${token}`)).toBe(true)
    for (const table of TRAINING_TABLES) expect(calls.some(call => call.url.includes(`/${table}?athlete_id=eq.${ATHLETE}`))).toBe(true)
    expect(logs).not.toContain(token)
    expect(logs).not.toContain('secret-signature')
    expect(logs).toContain(`ATHLETE_ID for the unrelated run: ${ATHLETE}`)
    expect(logs).toMatch(/ROLE owner: PASS 4, FAIL 0, SKIP 0 of 4/)
  })

  it('owner with no rows fails rather than passing on nothing', async () => {
    expect((await run({ role: 'owner', sub: ATHLETE, rows: 0 })).logs).toMatch(/FAIL 4/)
  })

  it("guardian: finds the accepted child and checks the child's rows", async () => {
    const { calls, logs } = await run({ role: 'guardian', sub: GUARDIAN })
    expect(calls[0].url).toContain(`/guardian_links?select=athlete_id&status=eq.accepted&guardian_id=eq.${GUARDIAN}`)
    for (const table of TRAINING_TABLES) expect(calls.some(call => call.url.includes(`/${table}?athlete_id=eq.${ATHLETE}`))).toBe(true)
    expect(logs).toMatch(/ROLE guardian: PASS 4, FAIL 0/)
  })

  it("unrelated: a row of someone else's data is a FAIL; none is a PASS", async () => {
    expect((await run({ role: 'unrelated', sub: OTHER, athleteId: ATHLETE, rows: 1 })).logs).toMatch(/ROLE unrelated: PASS \d+, FAIL [1-9]/)
    expect((await run({ role: 'unrelated', sub: OTHER, athleteId: ATHLETE, rows: 0 })).logs).toMatch(/ROLE unrelated: PASS \d+, FAIL 0/)
  })

  it('refuses to run the unrelated checks as the athlete themselves, or without a sign-in', async () => {
    expect((await run({ role: 'unrelated', sub: ATHLETE, athleteId: ATHLETE })).logs).toContain('Sign in as a different person')
    expect((await run({ role: 'owner' })).logs).toContain('No Staging sign-in found')
  })
})
