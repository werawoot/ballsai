import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// When a session is refreshed, the middleware response carries the new auth cookies.
// @supabase/ssr (0.10+) hands setAll the cache headers that must go with them, so no CDN
// or proxy caches one person's session and serves it to someone else.
const auth = vi.hoisted(() => ({ refresh: false, user: null as null | { id: string } }))

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, options: { cookies: { setAll: (c: unknown[], h: Record<string, string>) => void } }) => ({
    auth: {
      getUser: async () => {
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

import { middleware } from '@/middleware'

describe('middleware auth cookies', () => {
  beforeEach(() => { auth.refresh = false; auth.user = null })

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
