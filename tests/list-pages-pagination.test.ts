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
    select: () => builder, eq: () => builder, gt: () => builder, order: () => builder,
    range: async (from: number, to: number) => ({ data: table.rows.slice(from, to + 1), error: null }),
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

const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))

import VenuesPage from '@/app/venues/page'
import TournamentsPage from '@/app/tournaments/page'

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
