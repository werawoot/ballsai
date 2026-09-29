import { describe, expect, it } from 'vitest'
import {
  DEFAULTS, assertLoadTarget, classify, findSupabaseRefs, judge, percentile, pickScenario, summarize,
} from '../scripts/load-plan.mjs'

// T39: a load test against the web app, 200 simultaneous users by default, passing when
// p95 < 1.5 s and errors < 1% (owner, 29 Sep). It must never point that load at
// Production: the site's own JavaScript names the Supabase project it talks to, and the
// script refuses unless that is Staging.

const STAGING = 'vorpnkedpscsqhnrssrl'
const PRODUCTION = 'hivedzrwrrcnjrlirhtv'

describe('where the load test may run', () => {
  const ok = { targetUrl: 'https://ballsai-git-staging.vercel.app', refs: [STAGING], allow: 'true' }

  it('runs against a site wired to Staging, when asked', () => {
    expect(assertLoadTarget(ok)).toBeNull()
  })

  it('refuses the Production site, a site wired to Production, or an unknown database', () => {
    expect(assertLoadTarget({ ...ok, targetUrl: 'https://ballsai-teal.vercel.app' })).toMatch(/Production/)
    expect(assertLoadTarget({ ...ok, targetUrl: 'https://www.balldoensai.com/' })).toMatch(/Production/)
    expect(assertLoadTarget({ ...ok, refs: [PRODUCTION] })).toMatch(/Production/)
    expect(assertLoadTarget({ ...ok, refs: [STAGING, PRODUCTION] })).toMatch(/Production/)
    expect(assertLoadTarget({ ...ok, refs: [] })).toMatch(/Staging/)
  })

  it('needs a URL and an explicit yes', () => {
    expect(assertLoadTarget({ ...ok, targetUrl: '' })).toMatch(/LOAD_TEST_URL/)
    expect(assertLoadTarget({ ...ok, targetUrl: 'not a url' })).toMatch(/LOAD_TEST_URL/)
    expect(assertLoadTarget({ ...ok, allow: undefined })).toMatch(/ALLOW_LOAD_TEST=true/)
  })

  it('allows a local build only on localhost with ALLOW_LOAD_TEST=local', () => {
    expect(assertLoadTarget({ targetUrl: 'http://localhost:3000', refs: [], allow: 'local' })).toBeNull()
    expect(assertLoadTarget({ targetUrl: 'http://127.0.0.1:3000', refs: [], allow: 'local' })).toBeNull()
    expect(assertLoadTarget({ targetUrl: 'http://localhost:3000', refs: [PRODUCTION], allow: 'local' })).toMatch(/Production/)
    expect(assertLoadTarget({ targetUrl: 'https://ballsai-git-staging.vercel.app', refs: [], allow: 'local' })).toMatch(/Staging/)
    expect(assertLoadTarget({ ...ok, allow: 'local' })).toMatch(/ALLOW_LOAD_TEST=true/)
  })

  it('finds the Supabase project a bundle talks to', () => {
    const chunk = `const u="https://${STAGING}.supabase.co",k="x";fetch("https://${STAGING}.supabase.co/rest/v1")`
    expect(findSupabaseRefs(chunk)).toEqual([STAGING])
    expect(findSupabaseRefs('no database here')).toEqual([])
  })
})

describe('what each user does', () => {
  const scenarios = [{ name: 'public', weight: 70 }, { name: 'signed-in', weight: 25 }, { name: 'organizer', weight: 5 }]

  it('picks scenarios by weight', () => {
    expect(pickScenario(scenarios, 0).name).toBe('public')
    expect(pickScenario(scenarios, 0.699).name).toBe('public')
    expect(pickScenario(scenarios, 0.7).name).toBe('signed-in')
    expect(pickScenario(scenarios, 0.949).name).toBe('signed-in')
    expect(pickScenario(scenarios, 0.95).name).toBe('organizer')
    expect(pickScenario(scenarios, 0.9999).name).toBe('organizer')
  })

  it('keeps the owner\'s defaults', () => {
    expect(DEFAULTS).toMatchObject({ users: 200, p95Ms: 1500, maxErrorRate: 0.01 })
  })
})

describe('counting and judging', () => {
  it('counts a server error, a timeout and a bounce to login as errors; 429 on its own', () => {
    expect(classify({ status: 200 })).toBe('ok')
    expect(classify({ status: 307, location: '/tournaments' })).toBe('ok')
    expect(classify({ status: 307, location: '/login?next=%2Fprofile', signedIn: true })).toBe('error')
    expect(classify({ status: 404 })).toBe('error')
    expect(classify({ status: 503 })).toBe('error')
    expect(classify({ status: 0, error: 'timeout' })).toBe('error')
    expect(classify({ status: 429 })).toBe('rate_limited')
  })

  it('computes nearest-rank percentiles', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1)
    expect(percentile(values, 50)).toBe(50)
    expect(percentile(values, 95)).toBe(95)
    expect(percentile(values, 99)).toBe(99)
    expect(percentile([], 95)).toBe(0)
  })

  it('summarizes per route and overall', () => {
    const samples = [
      ...Array.from({ length: 98 }, (_, i) => ({ route: '/ranking', ms: 100 + i, status: 200 })),
      { route: '/ranking', ms: 5000, status: 503 },
      { route: '/profile', ms: 300, status: 429 },
    ]
    const summary = summarize(samples)
    expect(summary.overall).toMatchObject({ requests: 100, errors: 1, rateLimited: 1 })
    expect(summary.routes['/ranking']).toMatchObject({ requests: 99, errors: 1 })
    // 100..197, then 300 and 5000: the 95th smallest of 100 is 194.
    expect(summary.overall.p95).toBe(194)
  })

  it('passes, fails or reports partial, never passing with a scenario skipped', () => {
    const good = summarize(Array.from({ length: 200 }, () => ({ route: '/', ms: 400, status: 200 })))
    expect(judge(good, DEFAULTS, []).verdict).toBe('PASS')
    expect(judge(good, DEFAULTS, ['signed-in']).verdict).toBe('PARTIAL')
    const slow = summarize(Array.from({ length: 200 }, () => ({ route: '/', ms: 1600, status: 200 })))
    expect(judge(slow, DEFAULTS, []).verdict).toBe('FAIL')
    const erroring = summarize([...Array.from({ length: 97 }, () => ({ route: '/', ms: 100, status: 200 })), ...Array.from({ length: 3 }, () => ({ route: '/', ms: 100, status: 500 }))])
    expect(judge(erroring, DEFAULTS, []).verdict).toBe('FAIL')
    expect(judge(summarize([]), DEFAULTS, []).verdict).toBe('FAIL')
  })
})
