import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database is the boundary: a fixed, ordered table answered through `.range()`.
const table = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))
function fakeClient() {
  const builder = {
    select: () => builder, eq: () => builder, gt: () => builder, lte: () => builder, lt: () => builder, gte: () => builder, ilike: () => builder, in: () => builder, order: () => builder,
    range: async (from: number, to: number) => ({ data: table.rows.slice(from, to + 1), error: null }),
    limit: async () => ({ data: [], error: null }),
  }
  return { from: () => builder }
}
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => fakeClient() }))
// /tournaments reads through lib/public-data: its anon client and its cache wrapper.
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
// /athletes reads with the signed-in visitor's client.
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))

const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))

import VenuesPage from '@/app/venues/page'
import TournamentsPage from '@/app/tournaments/page'
import AthletesPage from '@/app/athletes/page'
import HallOfFamePage from '@/app/hall-of-fame/page'

const venue = (index: number) => ({ id: `v${index}`, name: `Venue ${index}`, province: 'Bangkok', description: '', amenities: [], venue_courts: [] })
const render = async (page: (props: never) => Promise<ReactElement>, searchParams: Record<string, string>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'en', messages, timeZone: 'Asia/Bangkok' } as never,
    await page({ searchParams } as never)))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'))

describe('/venues, one page at a time', () => {
  it('links to the page before and the page after', async () => {
    table.rows = Array.from({ length: 45 }, (_, index) => venue(index + 1))
    const html = await render(VenuesPage as never, { page: '2' })
    expect(html).toContain('Venue 21')
    expect(html).not.toContain('Venue 41')
    expect(hrefs(html)).toEqual(expect.arrayContaining(['/venues?page=1', '/venues?page=3']))
  })

  it('offers no next page on the last one', async () => {
    table.rows = Array.from({ length: 45 }, (_, index) => venue(index + 1))
    const html = await render(VenuesPage as never, { page: '3' })
    expect(html).toContain('Venue 45')
    expect(hrefs(html)).toContain('/venues?page=2')
    expect(hrefs(html)).not.toContain('/venues?page=4')
  })
})

const tournament = (index: number) => ({ id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, name: `Cup ${index}`, description: '', start_date: '2026-11-01', fee: 500, status: 'open', venue: 'Pitch', sport: 'football' })

describe('/tournaments, one page at a time', () => {
  it('links to the page before and the page after', async () => {
    table.rows = Array.from({ length: 45 }, (_, index) => tournament(index + 1))
    const html = await render(TournamentsPage as never, { page: '2' })
    expect(html).toContain('Cup 21')
    expect(html).not.toContain('Cup 41')
    expect(hrefs(html)).toEqual(expect.arrayContaining(['/tournaments?page=1', '/tournaments?page=3']))
  })

  it('offers no next page on the last one', async () => {
    table.rows = Array.from({ length: 45 }, (_, index) => tournament(index + 1))
    const html = await render(TournamentsPage as never, { page: '3' })
    expect(html).toContain('Cup 45')
    expect(hrefs(html)).not.toContain('/tournaments?page=4')
  })
})

const athlete = (index: number) => ({ user_id: `u${index}`, display_name: `Athlete ${index}`, age: null, position: 'MF', province: 'เชียงใหม่', current_team: null, profile_image_url: null, verification_level: 'self' })

describe('/athletes, one page at a time', () => {
  it('shows athlete 101, which limit(100) used to hide, on the last page', async () => {
    table.rows = Array.from({ length: 101 }, (_, index) => athlete(index + 1))
    const html = await render(AthletesPage as never, { page: '5' })
    expect(html).toContain('Athlete 101')
    expect(html).not.toContain('Athlete 96<')
    expect(hrefs(html)).toContain('/athletes?page=4')
    expect(hrefs(html)).not.toContain('/athletes?page=6')
  })

  it('keeps the filters in the page links', async () => {
    table.rows = Array.from({ length: 60 }, (_, index) => athlete(index + 1))
    const html = await render(AthletesPage as never, { province: 'เชียงใหม่', age: 'u15', page: '2' })
    const query = (page: number) => `/athletes?${new URLSearchParams({ province: 'เชียงใหม่', age: 'u15', page: String(page) })}`
    expect(hrefs(html)).toEqual(expect.arrayContaining([query(1), query(3)]))
  })
})

const honour = (index: number) => ({ id: `h${index}`, season: '2026', category: 'mvp', age_group: 'U15', province: 'น่าน', athlete_id: null, player_rank_id: null, athlete_name: `Honour ${index}`, team_name: null, position: 'MF', image_url: null, citation: 'Best of the season' })

// T49: a season's Hall of Fame used to arrive in one read, cut at the API's row limit.
describe('/hall-of-fame, one page at a time', () => {
  it('shows the second page and links back, keeping the season and filters', async () => {
    table.rows = Array.from({ length: 30 }, (_, index) => honour(index + 1))
    const html = await render(HallOfFamePage as never, { season: '2026', category: 'mvp', page: '2' })
    expect(html).toContain('Honour 25')
    expect(html).toContain('Honour 30')
    expect(html).not.toContain('Honour 24<')
    expect(hrefs(html)).toContain(`/hall-of-fame?${new URLSearchParams({ season: '2026', category: 'mvp', page: '1' })}`)
    expect(hrefs(html).some(href => href.includes('page=3'))).toBe(false)
  })

  it('offers the next page from the first', async () => {
    table.rows = Array.from({ length: 30 }, (_, index) => honour(index + 1))
    const html = await render(HallOfFamePage as never, {})
    expect(html).toContain('Honour 24')
    expect(html).not.toContain('Honour 25<')
    expect(hrefs(html)).toContain('/hall-of-fame?page=2')
  })
})
