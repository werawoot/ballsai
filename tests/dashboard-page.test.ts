import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database is the boundary: tables answered in order, with eq filters (also on the
// embedded tournament), head counts and ranges, as PostgREST would.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]> }))
function fakeClient() {
  const from = (table: string) => {
    let rows = db.tables[table] ?? []
    let head = false
    let slice: [number, number] | null = null
    const get = (row: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
    const builder = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => get(row, column) === value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(get(row, column))); return builder },
      order: () => builder,
      range: (start: number, end: number) => { slice = [start, end]; return builder },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(head
        ? { data: null, count: rows.length, error: null }
        : { data: slice ? rows.slice(slice[0], slice[1] + 1) : rows, count: null, error: null }).then(resolve),
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: 'org-1' } } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/dashboard',
}))
const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))

import DashboardPage from '@/app/dashboard/page'

const tournaments = Array.from({ length: 25 }, (_, index) => ({ id: `t${index + 1}`, name: `Cup ${index + 1}`, organizer_id: 'org-1', location: 'Pitch', start_date: '2026-11-01', fee: 500, status: 'open' }))
const pending = Array.from({ length: 15 }, (_, index) => ({ id: `team${index + 1}`, name: `Team ${index + 1}`, status: 'pending', members: '', tournament_id: 't1', tournaments: { name: 'Cup 1', organizer_id: 'org-1' } }))
const render = async (searchParams: Record<string, string>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'en', messages, timeZone: 'Asia/Bangkok' } as never,
    await (DashboardPage as (props: never) => Promise<ReactElement>)({ searchParams } as never)))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'))

describe('/dashboard pages its tournaments and its approval queue separately', () => {
  it('keeps the other list\'s page in every page link', async () => {
    db.tables = { profiles: [{ id: 'org-1', role: 'organizer' }], tournaments, teams: pending, payments: [] }
    const html = await render({ page: '2', pending: '2' })
    expect(html).toContain('Cup 11')
    expect(html).not.toContain('Cup 21<')
    expect(hrefs(html)).toEqual(expect.arrayContaining([
      '/dashboard?pending=2&page=1', '/dashboard?pending=2&page=3',
      '/dashboard?page=2&pending=1',
    ]))
    expect(hrefs(html)).not.toContain('/dashboard?page=2&pending=3')
  })

  it('shows the totals from counts, not from the rows on this page', async () => {
    db.tables = { profiles: [{ id: 'org-1', role: 'organizer' }], tournaments, teams: pending, payments: [] }
    const html = await render({})
    expect(html).toContain('>25<')
    expect(html).toContain('(15)')
  })

  it('still offers the way back from a queue page emptied by approvals', async () => {
    db.tables = { profiles: [{ id: 'org-1', role: 'organizer' }], tournaments, teams: pending.slice(0, 5), payments: [] }
    const html = await render({ pending: '2' })
    expect(hrefs(html)).toContain('/dashboard?pending=1')
  })
})

describe('/dashboard approval cards: one button per pending team', () => {
  const team = (id: string, fee: number | null) => ({ id, name: `Team ${id}`, status: 'pending', members: '', tournament_id: 't1', tournaments: { name: 'Cup 1', organizer_id: 'org-1', fee } })
  const paying = (teamId: string, status = 'pending') => ({ id: `pay-${teamId}`, team_id: teamId, amount: 500, status, slip_url: 'slips/x.jpg' })
  const base = { profiles: [{ id: 'org-1', role: 'organizer' }], tournaments }

  it('confirms the team and its payment with one button when a slip is waiting', async () => {
    db.tables = { ...base, teams: [team('a', 500)], payments: [paying('a')] }
    const html = await render({})
    expect(html).toContain('Confirm team and payment')
    expect(html).not.toContain('>Confirm<')
    expect(html).toContain('Reject')
  })

  it('offers only the team confirmation where there is no fee and no payment', async () => {
    db.tables = { ...base, teams: [team('b', 0)], payments: [] }
    const html = await render({})
    expect(html).toContain('>Confirm<')
    expect(html).not.toContain('Confirm team and payment')
  })

  it('offers only the team confirmation once the payment is confirmed', async () => {
    db.tables = { ...base, teams: [team('c', 500)], payments: [paying('c', 'confirmed')] }
    const html = await render({})
    expect(html).toContain('>Confirm<')
    expect(html).not.toContain('Confirm team and payment')
  })

  it('waits for the slip of a paid tournament: no confirm button, a way to reject', async () => {
    db.tables = { ...base, teams: [team('d', 500)], payments: [] }
    const html = await render({})
    expect(html).not.toContain('>Confirm<')
    expect(html).not.toContain('Confirm team and payment')
    expect(html).toContain('Reject')
  })
})

describe('/dashboard for an account that is not an organizer yet', () => {
  it('explains instead of sending them back to the home page, and offers no contact button', async () => {
    db.tables = { profiles: [{ id: 'org-1', role: 'user' }], tournaments: [], teams: [], payments: [] }
    const html = await render({})
    expect(html).toContain('This account is not an organizer yet')
    expect(html).toContain('An admin turns on organizer access')
    expect(hrefs(html)).toContain('/tournaments')
    expect(html).not.toMatch(/line\.me|mailto:|tel:/)
  })

  it('still shows the dashboard to an organizer and to an admin', async () => {
    for (const role of ['organizer', 'admin']) {
      db.tables = { profiles: [{ id: 'org-1', role }], tournaments, teams: [], payments: [] }
      const html = await render({})
      expect(html).not.toContain('This account is not an organizer yet')
      expect(html).toContain('Cup 1')
    }
  })
})
