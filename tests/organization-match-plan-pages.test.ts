import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database is the boundary. Like the real one it answers filters, ranges and head
// counts, but it applies no RLS: anything the page does not filter for comes back.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, user: 'user-1' }))
function fakeClient() {
  const get = (row: Record<string, unknown>, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Record<string, unknown> | undefined)?.[key], row)
  const from = (table: string) => {
    let rows = db.tables[table] ?? []
    let head = false
    let window: [number, number] | null = null
    const builder = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => get(row, column) === value); return builder },
      ilike: (column: string, value: string) => { const needle = value.replace(/%/g, '').toLowerCase(); rows = rows.filter(row => String(get(row, column)).toLowerCase().includes(needle)); return builder },
      order: () => builder,
      range: (start: number, end: number) => { window = [start, end]; return builder },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(head
        ? { data: null, count: rows.length, error: null }
        : { data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null }).then(resolve),
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: db.user } } }) } }
}
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => fakeClient() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))

import OrganizationPage from '@/app/organization/page'
import MatchPlanPage from '@/app/match-plan/page'

const render = async (page: unknown, searchParams: Record<string, string>) =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'en', messages, timeZone: 'Asia/Bangkok' } as never,
    await (page as (props: never) => Promise<ReactElement>)({ searchParams } as never)))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1].replace(/&amp;/g, '&'))

describe('/organization', () => {
  it('shows a page of my own organizations with their member counts', async () => {
    const orgs = Array.from({ length: 11 }, (_, index) => ({ id: `org-${index + 1}`, name: `Academy ${index + 1}`, kind: 'academy', province: 'Chiang Mai', description: '' }))
    db.user = 'user-1'
    db.tables = { organization_members: [
      ...orgs.map((org, index) => ({ id: `m${index}`, organization_id: org.id, user_id: 'user-1', role: 'owner', status: 'accepted', organizations: org })),
      { id: 'x', organization_id: 'org-z', user_id: 'user-2', role: 'owner', status: 'accepted', organizations: { id: 'org-z', name: 'Stranger Academy', kind: 'club', province: 'Bangkok', description: '' } },
      ...Array.from({ length: 40 }, (_, index) => ({ id: `a${index}`, organization_id: 'org-1', user_id: `athlete-${index}`, role: 'athlete', status: 'accepted' })),
    ] }
    const html = await render(OrganizationPage, {})
    expect(html).toContain('Academy 10')
    expect(html).not.toContain('Academy 11')
    expect(html).not.toContain('Stranger Academy')
    expect(html).toContain('41 ')
    expect(hrefs(html)).toContain('/organization?page=2')
  })
})

describe('/match-plan', () => {
  const teams = [
    { id: 't-mine', name: 'My Lions', status: 'confirmed', tournament_id: 'cup-a', created_by: 'user-1', tournaments: { name: 'Cup A', start_date: '2026-11-01', organizer_id: 'org-9' } },
    { id: 't-entered', name: 'Entered Eagles', status: 'confirmed', tournament_id: 'cup-b', created_by: 'coach-2', tournaments: { name: 'Cup B', start_date: '2026-11-02', organizer_id: 'user-1' } },
    { id: 't-stranger', name: 'Stranger FC', status: 'confirmed', tournament_id: 'cup-c', created_by: 'coach-3', tournaments: { name: 'Cup C', start_date: '2026-11-03', organizer_id: 'org-9' } },
  ]

  it('starts an organizer on the teams in their tournaments, and never shows a stranger\'s', async () => {
    db.user = 'user-1'
    db.tables = { profiles: [{ id: 'user-1', role: 'organizer', onboarding_persona: null }], teams }
    const organized = await render(MatchPlanPage, {})
    expect(organized).toContain('Entered Eagles')
    expect(organized).not.toContain('My Lions')
    expect(organized).not.toContain('Stranger FC')
    const mine = await render(MatchPlanPage, { scope: 'mine' })
    expect(mine).toContain('My Lions')
    expect(mine).not.toContain('Entered Eagles')
    expect(mine).not.toContain('Stranger FC')
    expect(hrefs(mine)).toEqual(expect.arrayContaining(['/match-plan?scope=mine', '/match-plan?scope=organized']))
  })

  it('starts a coach on the teams they created, and says so when a search finds none', async () => {
    db.user = 'user-1'
    db.tables = { profiles: [{ id: 'user-1', role: 'athlete', onboarding_persona: 'coach_organizer' }], teams }
    expect(await render(MatchPlanPage, {})).toContain('My Lions')
    expect(await render(MatchPlanPage, { q: 'nothing like this' })).toContain('No teams here yet')
  })

  it('shows a coach their team on a pitch board, without the organizer\'s team groups', async () => {
    db.user = 'user-1'
    db.tables = { profiles: [{ id: 'user-1', role: 'athlete', onboarding_persona: 'coach_organizer' }], teams }
    const html = await render(MatchPlanPage, {})
    expect(hrefs(html)).not.toContain('/match-plan?scope=organized')
    expect(html).toContain('My Lions')
  })
})
