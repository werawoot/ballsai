import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// When a session is refreshed, the middleware response carries the new auth cookies.
// @supabase/ssr (0.10+) hands setAll the cache headers that must go with them, so no CDN
// or proxy caches one person's session and serves it to someone else.
const auth = vi.hoisted(() => ({ refresh: false, user: null as null | { id: string }, calls: 0 }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (c: unknown[], h: Record<string, string>) => void } }) => ({
    auth: {
      getUser: async () => {
        auth.calls += 1
        if (auth.refresh) {
          options.cookies.setAll(
            [{ name: 'sb-x-auth-token', value: 'new-session', options: { path: '/', httpOnly: true } }],
            { 'Cache-Control': 'private, no-cache, no-store, must-revalidate, max-age=0', Expires: '0', Pragma: 'no-cache' },
          )
        }
        return { data: { user: auth.user } }
      },
    },
  }),
}))

import { config, middleware } from '@/middleware'

describe('middleware auth cookies', () => {
  beforeEach(() => { auth.refresh = false; auth.user = null; auth.calls = 0 })

  it('sends the refreshed session with headers that forbid caching it', async () => {
    auth.refresh = true
    auth.user = { id: 'u1' }
    const response = await middleware(new NextRequest('http://localhost/ranking'))
    expect(response.cookies.get('sb-x-auth-token')?.value).toBe('new-session')
    expect(response.headers.get('cache-control')).toBe('private, no-cache, no-store, must-revalidate, max-age=0')
    expect(response.headers.get('pragma')).toBe('no-cache')
    expect(response.headers.get('expires')).toBe('0')
  })

  it('adds no cache headers when no auth cookie is written', async () => {
    const response = await middleware(new NextRequest('http://localhost/ranking'))
    expect(response.headers.get('cache-control')).toBeNull()
  })

  it('still sends a signed-out visitor of a protected page to login', async () => {
    const response = await middleware(new NextRequest('http://localhost/profile/edit?x=1'))
    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toBe('http://localhost/login?next=%2Fprofile%2Fedit%3Fx%3D1')
  })
})

// Owner, 22 Oct 2026: "คลิกไปหน้าไหนก็ดูโหลดช้า". Measured on a local mock: opening
// /tournaments signed in asked Supabase Auth who the user was 10 times, because the
// middleware ran getUser for every photo and for every link Next prefetches. A page load
// still checks (and refreshes the session); a photo, or a prefetch of a public page, does
// not, and the page itself still checks the user when it renders.
describe('middleware skips the Supabase round trip where it adds nothing', () => {
  beforeEach(() => { auth.refresh = false; auth.user = null; auth.calls = 0 })
  const prefetch = (url: string) => new NextRequest(url, { headers: { 'next-router-prefetch': '1' } })

  it('never runs for the page photos or other static files', () => {
    const [matcher] = config.matcher
    const pattern = new RegExp(`^${matcher}$`)
    for (const path of ['/photos/head-net-dark.webp', '/icon.svg', '/apple-touch-icon.png', '/fonts/x.woff2']) expect(pattern.test(path), path).toBe(false)
    for (const path of ['/', '/tournaments', '/profile/edit', '/api/health', '/players/abc']) expect(pattern.test(path), path).toBe(true)
  })

  it('does not ask Supabase for a prefetch of a public page', async () => {
    const response = await middleware(prefetch('http://localhost/ranking'))
    expect(auth.calls).toBe(0)
    expect(response.status).toBe(200)
  })

  it('still checks a real page load and a prefetch of a protected page', async () => {
    await middleware(new NextRequest('http://localhost/ranking'))
    expect(auth.calls).toBe(1)
    const response = await middleware(prefetch('http://localhost/profile'))
    expect(auth.calls).toBe(2)
    expect(response.status).toBe(307)
  })
})
