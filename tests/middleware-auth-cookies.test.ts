import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
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
const everyPage = () => {
  const entry = config.matcher.find(item => item.source !== '/admin/:path*')
  if (!entry || typeof entry === 'string') throw new Error('no page matcher')
  return entry as { source: string; missing?: unknown }
}
const appRoot = fileURLToPath(new URL('../', import.meta.url))
const walk = (dir: string): string[] => readdirSync(`${appRoot}${dir}`).flatMap(entry => {
  const path = `${dir}/${entry}`
  return statSync(`${appRoot}${path}`).isDirectory() ? walk(path) : [path]
})

describe('middleware skips the Supabase round trip where it adds nothing', () => {
  beforeEach(() => { auth.refresh = false; auth.user = null; auth.calls = 0 })
  // A browser's own prefetch. Next's <Link> prefetches are left out by config.matcher (next test).
  const prefetch = (url: string) => new NextRequest(url, { headers: { 'sec-purpose': 'prefetch' } })

  it('never runs for the page photos or other static files', () => {
    const pattern = new RegExp(`^${everyPage().source}$`)
    for (const path of ['/photos/head-net-dark.webp', '/icon.svg', '/apple-touch-icon.png', '/fonts/x.woff2']) expect(pattern.test(path), path).toBe(false)
    for (const path of ['/', '/tournaments', '/profile/edit', '/api/health', '/players/abc']) expect(pattern.test(path), path).toBe(true)
  })

  // T62: Next removes next-router-prefetch before middleware runs, so only the matcher, which the
  // router checks on the raw request, can leave a <Link> prefetch out. Checked end to end with
  // next start on 21 Nov 2026 (0 Auth calls per prefetch, 1 before).
  it('leaves every <Link> prefetch out in the matcher, not in the function', () => {
    expect(everyPage().missing).toEqual([{ type: 'header', key: 'next-router-prefetch' }])
  })

  // A prefetch renders down to the nearest loading.tsx; only app/admin has one, and its layout asks
  // Supabase who the user is. Its prefetches keep running middleware, which refreshes an expired
  // session where the cookie can be written. A new loading.tsx elsewhere needs the same look.
  it('still runs for an /admin prefetch, the only route a prefetch renders a layout for', () => {
    const admin = config.matcher.find(entry => entry.source === '/admin/:path*')
    expect(admin).toEqual({ source: '/admin/:path*' })
    const loadings = walk('app').filter(path => path.endsWith('/loading.tsx'))
    expect(loadings).toEqual(['app/admin/loading.tsx'])
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
