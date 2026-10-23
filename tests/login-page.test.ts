import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) } }))
vi.mock('@/app/login/LoginPanel', () => ({ default: () => null }))
// The stats bar's counts come from the public cache; here it fails, and /login still opens.
const counts = vi.hoisted(() => ({ mode: 'fail' as 'fail' | 'hang' }))
vi.mock('@/lib/public-data', () => ({ getPublicPlatformCounts: () => counts.mode === 'hang' ? new Promise(() => {}) : Promise.reject(new Error('offline')) }))

import LoginPage from '@/app/login/page'

const open = (searchParams: Record<string, string>) => LoginPage({ searchParams: Promise.resolve(searchParams) } as never)

// Chrome test, 8 Oct 2026: a signed-in person who opened /login saw the sign-in form again.
describe('/login', () => {
  it('sends someone already signed in on to where they were going, or ของฉัน', async () => {
    auth.user = { id: 'u1' }
    await expect(open({})).rejects.toThrow('redirect /profile')
    await expect(open({ next: '/card' })).rejects.toThrow('redirect /card')
    await expect(open({ next: '//evil.example' })).rejects.toThrow('redirect /profile')
  })
  it('shows the form to someone signed out, and the admin form even when signed in', async () => {
    auth.user = null
    await expect(open({})).resolves.toBeTruthy()
    auth.user = { id: 'u1' }
    await expect(open({ admin: '1' })).resolves.toBeTruthy()
  })
})

// Review, 23 Oct 2026: the stats bar must never hold up signing in.
describe('/login stats bar', () => {
  it('opens with the facts and the provinces when the counts fail or hang', async () => {
    auth.user = null
    counts.mode = 'fail'
    const element = await open({}) as { props: { stats: unknown[] } }
    expect(element.props.stats.map((stat: { key: string }) => stat.key)).toEqual(['sports', 'roles', 'fee', 'provinces'])
    counts.mode = 'hang'
    const started = Date.now()
    const slow = await open({}) as { props: { stats: unknown[] } }
    expect(Date.now() - started).toBeLessThan(2000)
    expect(slow.props.stats.map((stat: { key: string }) => stat.key)).toEqual(['sports', 'roles', 'fee', 'provinces'])
  })
})
