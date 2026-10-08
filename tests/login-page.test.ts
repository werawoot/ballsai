import { describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({ user: null as null | { id: string } }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: auth.user } }) } }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) } }))
vi.mock('@/app/login/LoginPanel', () => ({ default: () => null }))

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
