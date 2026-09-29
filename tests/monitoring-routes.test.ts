import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkHealth, cleanClientError } from '@/lib/health'

// T30: an uptime monitor needs one URL that says whether the site and its database
// answer, and a browser crash must reach the server logs where alerts can see it.
describe('health check', () => {
  const answering = (result: { error: unknown }, delay = 0) => ({
    from: () => ({ select: () => ({ limit: () => new Promise(resolve => setTimeout(() => resolve(result), delay)) }) }),
  })

  it('reports ok when the database answers, with how long it took and the deployed version', async () => {
    const health = await checkHealth(answering({ error: null }) as never, { version: 'abcdef1234567', timeoutMs: 1000 })
    expect(health).toMatchObject({ status: 'ok', httpStatus: 200, version: 'abcdef1', checks: { database: { ok: true } } })
    expect(typeof health.checks.database.ms).toBe('number')
  })

  it('reports degraded (503) when the database errs, without passing the error text on', async () => {
    const health = await checkHealth(answering({ error: { message: 'password authentication failed for user x' } }) as never, { version: undefined, timeoutMs: 1000 })
    expect(health).toMatchObject({ status: 'degraded', httpStatus: 503, version: 'unknown', checks: { database: { ok: false } } })
    expect(JSON.stringify(health)).not.toMatch(/password|user x/)
  })

  it('reports degraded when the database is too slow to answer', async () => {
    const health = await checkHealth(answering({ error: null }, 200) as never, { version: 'v', timeoutMs: 20 })
    expect(health).toMatchObject({ status: 'degraded', httpStatus: 503, checks: { database: { ok: false, timedOut: true } } })
  })
})

describe('browser error report', () => {
  it('keeps only a short message, the digest and the path without its query', () => {
    expect(cleanClientError({ message: 'x'.repeat(500), digest: 'd1', path: '/players/abc?token=secret#top' })).toEqual({
      message: 'x'.repeat(300), digest: 'd1', path: '/players/abc',
    })
  })

  it('drops emails and long digit runs from the message, and refuses anything that is not a report', () => {
    expect(cleanClientError({ message: 'failed for somchai@example.com card 4111111111111111', path: '/profile' })?.message)
      .toBe('failed for [email] card [number]')
    expect(cleanClientError(null)).toBeNull()
    expect(cleanClientError({ message: 42 })).toBeNull()
    expect(cleanClientError({ message: '' })).toBeNull()
    expect(cleanClientError({ message: 'x', path: 'https://evil.example/' })).toMatchObject({ path: null })
  })
})

// The route that receives browser reports: rate-limited, logs one structured line.
const logged = vi.hoisted(() => ({ calls: [] as unknown[], allowed: true }))
vi.mock('@/lib/monitoring', () => ({ logServerError: (entry: unknown) => { logged.calls.push(entry) } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ allowed: logged.allowed, retryAfterSeconds: 30 }) }))

import { POST } from '@/app/api/client-errors/route'

const report = (body: unknown) => POST(new Request('http://localhost/api/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }))

describe('/api/client-errors', () => {
  beforeEach(() => { logged.calls = []; logged.allowed = true })

  it('logs a cleaned report as a client_error event', async () => {
    const response = await report({ message: 'boom for a@b.co', digest: 'd9', path: '/ranking?province=x' })
    expect(response.status).toBe(204)
    expect(logged.calls).toEqual([{ event: 'client_error', route: '/ranking', metadata: { message: 'boom for [email]', digest: 'd9' } }])
  })

  it('refuses a malformed report and logs nothing', async () => {
    expect((await report({ nope: true })).status).toBe(400)
    expect(logged.calls).toEqual([])
  })

  it('stops a flood from one address', async () => {
    logged.allowed = false
    const response = await report({ message: 'boom' })
    expect(response.status).toBe(429)
    expect(logged.calls).toEqual([])
  })
})
