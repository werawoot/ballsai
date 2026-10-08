import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

// The database is the boundary. Each table answers its rows, a count of all of them, and
// honours range() the way PostgREST does.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, asked: [] as string[] }))
function fakeClient() {
  const from = (table: string) => {
    db.asked.push(table)
    const rows = db.tables[table] ?? []
    let window: [number, number] | null = null
    const builder = {
      select: () => builder, eq: () => builder, order: () => builder,
      range: (start: number, end: number) => { window = [start, end]; return builder },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: window ? rows.slice(window[0], window[1] + 1) : rows, count: rows.length, error: null }).then(resolve),
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) } }))
vi.mock('@/lib/db/thailand-queries', () => ({ getAllRegions: async () => [], getAllProvinces: async () => [], getProvincesWithRegion: async () => [] }))

import InfrastructurePage from '@/app/admin/infrastructure/page'

const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const profiles = Array.from({ length: 120 }, (_, index) => ({ id: index === 0 ? 'admin-1' : `user-${String(index).padStart(4, '0')}`, full_name: `Person ${index}`, role: index === 0 ? 'admin' : 'user', team: null }))
const venues = [{ id: 'v-1', name: 'Rajamangala Court', province: 'Bangkok', address: '1 Road', is_published: true }, { id: 'v-2', name: 'Korat Arena', province: 'Nakhon Ratchasima', address: '2 Road', is_published: true }, { id: 'v-3', name: 'Hidden Pitch', province: 'Chiang Mai', address: '3 Road', is_published: false }]

// Chrome test, 8 Oct 2026: the page said "0 Venues, 0 Sports" while /venues showed venues.
// It counted the old `venues` and `sports` tables, which nothing else in the app uses.
describe('/admin/infrastructure', () => {
  it('counts the venues the app really has, from venue_profiles', async () => {
    db.tables = { profiles, venue_profiles: venues, venues: [], sports: [] }; db.asked = []
    const page = text(renderToStaticMarkup(await (InfrastructurePage as () => Promise<ReactElement>)()))
    expect(page).toMatch(/3 Venues/)
    expect(page).toContain('Korat Arena')
    expect(db.asked).not.toContain('venues')
    expect(db.asked).not.toContain('sports')
    expect(page).not.toMatch(/\bSports\b/)
  })
  it('counts every profile but lists only the newest 50, and says how many more there are', async () => {
    db.tables = { profiles, venue_profiles: venues }; db.asked = []
    const page = text(renderToStaticMarkup(await (InfrastructurePage as () => Promise<ReactElement>)()))
    expect(page).toMatch(/120 Profiles/)
    expect(page).toContain('Person 49')
    expect(page).not.toContain('Person 50 ')
    expect(page).toContain('and 70 more profiles')
  })
})
