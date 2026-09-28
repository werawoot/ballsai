import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database is the boundary: tables answered in order with eq/in/ilike filters,
// ranges, limits and single rows, as PostgREST would. The signed-in user is db.user.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, user: 'org-1' }))
function fakeClient() {
  const from = (table: string) => {
    let rows = db.tables[table] ?? []
    let window: [number, number] | null = null
    let cap: number | null = null
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      ilike: (column: string, value: string) => { const needle = value.replace(/%/g, '').toLowerCase(); rows = rows.filter(row => String(row[column]).toLowerCase().includes(needle)); return builder },
      order: () => builder,
      range: (start: number, end: number) => { window = [start, end]; return builder },
      limit: (count: number) => { cap = count; return builder },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        let data = window ? rows.slice(window[0], window[1] + 1) : rows
        if (cap !== null) data = data.slice(0, cap)
        return Promise.resolve({ data, error: null }).then(resolve)
      },
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: db.user } } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard/results',
}))
const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))

import MatchResultsPage from '@/app/dashboard/results/page'

const mine = Array.from({ length: 12 }, (_, index) => ({ id: `mine-${index + 1}`, name: `My Cup ${index + 1}`, organizer_id: 'org-1' }))
const theirs = [{ id: 'theirs-1', name: 'Their Cup', organizer_id: 'org-2' }]
const tables = () => ({
  profiles: [{ id: 'org-1', role: 'organizer' }, { id: 'admin-1', role: 'admin' }],
  tournaments: [...mine, ...theirs],
  teams: [{ id: 'team-a', name: 'Lions', tournament_id: 'mine-1', status: 'confirmed' }, { id: 'team-z', name: 'Zebras', tournament_id: 'theirs-1', status: 'confirmed' }],
  team_members: [], player_ranks: [], match_results: [],
})
const render = async (searchParams: Record<string, string>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'en', messages, timeZone: 'Asia/Bangkok' } as never,
    await (MatchResultsPage as (props: never) => Promise<ReactElement>)({ searchParams } as never)))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'))

describe('/dashboard/results works one tournament at a time', () => {
  it('lists a page of the organizer\'s own tournaments and opens the newest', async () => {
    db.tables = tables(); db.user = 'org-1'
    const html = await render({})
    expect(html).toContain('My Cup 10')
    expect(html).not.toContain('My Cup 11')
    expect(html).not.toContain('Their Cup')
    expect(html).toContain('Recording results for <b')
    expect(html).toContain('Lions')
    expect(html).not.toContain('Zebras')
    expect(hrefs(html)).toContain('/dashboard/results?tournament=mine-1&page=2')
  })

  it('refuses another organizer\'s tournament and shows no form for it', async () => {
    db.tables = tables(); db.user = 'org-1'
    const html = await render({ tournament: 'theirs-1' })
    expect(html).toContain('This tournament was not found, or you do not organise it')
    expect(html).not.toContain('Zebras')
    expect(html).not.toContain('Recording results for')
  })

  it('lets an admin search every tournament and open any of them', async () => {
    db.tables = tables(); db.user = 'admin-1'
    const html = await render({ q: 'Their', tournament: 'theirs-1' })
    expect(html).toContain('Their Cup')
    expect(html).not.toContain('My Cup 1<')
    expect(html).toContain('Zebras')
  })
})
