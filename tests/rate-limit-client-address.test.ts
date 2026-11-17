import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limit'

// T65: with no Cloudflare in front of doensai.com, cf-connecting-ip is the caller's own choice
// (why, in lib/rate-limit.ts above clientAddress). Each test uses its own scope, so buckets of one
// test never count in another.

const limit = { limit: 1, windowSeconds: 60 }
const request = (headers: Record<string, string>) => new Request('https://doensai.com/api/x', { method: 'POST', headers })
let testNumber = 0

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  testNumber += 1
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('checkRateLimit counts the address Vercel sets, not one the caller chooses', () => {
  it('a made-up cf-connecting-ip does not open a new bucket', async () => {
    const options = { scope: `t65-${testNumber}`, ...limit }
    const first = await checkRateLimit(request({ 'x-real-ip': '203.0.113.7', 'cf-connecting-ip': '198.51.100.1' }), options)
    const second = await checkRateLimit(request({ 'x-real-ip': '203.0.113.7', 'cf-connecting-ip': '198.51.100.2' }), options)
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
  })

  it('reads x-real-ip, then the first x-forwarded-for address', async () => {
    const options = { scope: `t65-${testNumber}`, ...limit }
    expect((await checkRateLimit(request({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), options)).allowed).toBe(true)
    expect((await checkRateLimit(request({ 'x-forwarded-for': '203.0.113.9' }), options)).allowed).toBe(false)
    expect((await checkRateLimit(request({ 'x-real-ip': '203.0.113.10' }), options)).allowed).toBe(true)
  })

  it('still keeps two different callers apart', async () => {
    const options = { scope: `t65-${testNumber}`, ...limit }
    expect((await checkRateLimit(request({ 'x-real-ip': '203.0.113.20' }), options)).allowed).toBe(true)
    expect((await checkRateLimit(request({ 'x-real-ip': '203.0.113.21' }), options)).allowed).toBe(true)
  })
})
