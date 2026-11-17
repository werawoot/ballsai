import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ADDRESS_CEILING_MULTIPLIER, checkAddressRateLimit, checkUserRateLimit } from '@/lib/rate-limit'

// T65, second part (owner: "ตกลง 20 เท่า", 17 Nov 2026). A signed-in route counts twice: a ceiling
// per address, 20 times the route's limit, before the user is known (it keeps floods off the auth
// call), then the route's own limit per account. People who share one address (venue Wi-Fi, a
// mobile network) each get their own quota; one person repeating a request is still stopped.

const options = (scope: string) => ({ scope, limit: 5, windowSeconds: 600 })
const venue = () => new Request('https://doensai.com/api/x', { method: 'POST', headers: { 'x-real-ip': '203.0.113.50' } })
let testNumber = 0

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  testNumber += 1
})

afterEach(() => {
  vi.unstubAllEnvs()
})

// What one signed-in request does in a route: the address ceiling, then the account's own limit.
async function signedInRequest(userId: string, scope: string) {
  const address = await checkAddressRateLimit(venue(), options(scope))
  if (!address.allowed) return false
  return (await checkUserRateLimit(userId, options(scope))).allowed
}

describe('per-account limits behind an address ceiling', () => {
  it('lets 20 people on one address each use their full quota', async () => {
    const scope = `t65b-${testNumber}`
    for (let person = 0; person < 20; person++) {
      for (let attempt = 0; attempt < 5; attempt++) {
        expect(await signedInRequest(`user-${person}`, scope)).toBe(true)
      }
    }
  })

  it('stops one person who repeats past their own limit, and only them', async () => {
    const scope = `t65b-${testNumber}`
    for (let attempt = 0; attempt < 5; attempt++) expect(await signedInRequest('repeater', scope)).toBe(true)
    expect(await signedInRequest('repeater', scope)).toBe(false)
    expect(await signedInRequest('neighbour', scope)).toBe(true)
  })

  it('stops an address past 20 times the limit, whoever signs in', async () => {
    const scope = `t65b-${testNumber}`
    const ceiling = 5 * ADDRESS_CEILING_MULTIPLIER
    for (let n = 0; n < ceiling; n++) expect((await checkAddressRateLimit(venue(), options(scope))).allowed).toBe(true)
    expect((await checkAddressRateLimit(venue(), options(scope))).allowed).toBe(false)
  })

  it('uses 20 as the multiplier the owner chose', () => {
    expect(ADDRESS_CEILING_MULTIPLIER).toBe(20)
  })
})

describe('every signed-in API route counts per account', () => {
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) walk(path)
      else if (name === 'route.ts') files.push(path)
    }
  }
  walk(new URL('../app/api', import.meta.url).pathname)
  const limited = files.filter(path => /check(Address|User)?RateLimit\(/.test(readFileSync(path, 'utf8')))

  it.each(limited.map(path => [path.split('/app/api/')[1], path]))('%s', (_name, path) => {
    const source = readFileSync(path, 'utf8')
    if (path.endsWith('/client-errors/route.ts')) {
      // No sign-in there: it stays per address.
      expect(source).toContain('checkRateLimit(request')
      return
    }
    expect(source).not.toMatch(/\bcheckRateLimit\(/)
    const address = source.indexOf('checkAddressRateLimit(request')
    const signIn = source.indexOf('if (!user)', address)
    const account = source.indexOf('checkUserRateLimit(user.id', signIn)
    expect(address).toBeGreaterThan(-1)
    expect(signIn).toBeGreaterThan(address)
    expect(account).toBeGreaterThan(signIn)
  })
})
