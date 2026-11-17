import { beforeEach, describe, expect, it, vi } from 'vitest'
import { checkRateLimit } from '@/lib/rate-limit'

// T65 (verified 17 Nov 2026): doensai.com is served by Vercel directly (Vercel nameservers, A
// records on Vercel), with no Cloudflare in front. Vercel overwrites x-forwarded-for and x-real-ip
// with the caller's address (https://vercel.com/docs/headers/request-headers), but passes any other
// header as the caller sent it. A cf-connecting-ip header is therefore the caller's own choice, and
// reading it first let anyone open a fresh bucket per request by changing it.

const limit = { limit: 1, windowSeconds: 60 }
const request = (headers: Record<string, string>) => new Request('https://doensai.com/api/x', { method: 'POST', headers })
let scope = 0

beforeEach(() => {
  vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
  vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
  scope += 1
})

describe('checkRateLimit counts the address Vercel sets, not one the caller chooses', () => {
  it('a made-up cf-connecting-ip does not open a new bucket', async () => {
    const options = { scope: `t65-${scope}`, ...limit }
    const first = await checkRateLimit(request({ 'x-real-ip': '203.0.113.7', 'cf-connecting-ip': '198.51.100.1' }), options)
    const second = await checkRateLimit(request({ 'x-real-ip': '203.0.113.7', 'cf-connecting-ip': '198.51.100.2' }), options)
    expect(first.allowed).toBe(true)
    expect(second.allowed).toBe(false)
  })

  it('reads x-real-ip, then the first x-forwarded-for address', async () => {
    const options = { scope: `t65-${scope}`, ...limit }
    expect((await checkRateLimit(request({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), options)).allowed).toBe(true)
    expect((await checkRateLimit(request({ 'x-forwarded-for': '203.0.113.9' }), options)).allowed).toBe(false)
    expect((await checkRateLimit(request({ 'x-real-ip': '203.0.113.10' }), options)).allowed).toBe(true)
  })

  it('still keeps two different callers apart', async () => {
    const options = { scope: `t65-${scope}`, ...limit }
    expect((await checkRateLimit(request({ 'x-real-ip': '203.0.113.20' }), options)).allowed).toBe(true)
    expect((await checkRateLimit(request({ 'x-real-ip': '203.0.113.21' }), options)).allowed).toBe(true)
  })
})
