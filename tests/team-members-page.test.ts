import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database is the boundary: tables answered with eq/in filters, as PostgREST would.
// The signed-in user is db.user.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, user: 'u1' }))
function fakeClient() {
  const from = (table: string) => {
    let rows = db.tables[table] ?? []
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
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
  usePathname: () => '/team-members',
}))
const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'th', messages, namespace } as never),
}))

import TeamMembersPage from '@/app/team-members/page'

const render = async () =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
    await (TeamMembersPage as () => Promise<ReactElement>)()))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])

const team = { id: 'tm1', name: 'ขอนแก่น U13', tournament_id: 't1', status: 'draft', created_by: 'u1', created_at: '2026-10-01', tournaments: { name: 'ศึกชิงถ้วย' } }
const invite = { id: 'm1', team_id: 'tm9', athlete_id: 'u1', status: 'pending', invited_at: '2026-10-01', created_at: '2026-10-01', teams: { name: 'ทีมที่เชิญ' } }

describe('/team-members for someone with no team and no invitation', () => {
  it('says there is no team yet and offers the tournaments, not a card about invitations', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('ยังไม่มีทีม')
    expect(hrefs(html)).toContain('/tournaments')
    expect(html).not.toContain('คำเชิญของฉัน')
    expect(html).not.toContain('เชิญนักกีฬาเข้าทีม')
  })

  it('tells an athlete where invitations will appear', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [], coach_attestations: [] }
    expect(await render()).toContain('โค้ชจะส่งคำเชิญมาที่นี่')
  })
})

describe('/team-members when there is something to show', () => {
  it('shows a pending invitation to an athlete without the empty state', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [invite], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('ทีมที่เชิญ')
    expect(html).toContain('คำเชิญของฉัน')
    expect(html).not.toContain('ยังไม่มีทีม')
  })

  it('shows a coach their team and the invite form, with no empty "my invitations" card', async () => {
    db.user = 'u1'; db.tables = { teams: [team], team_members: [], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('เชิญนักกีฬาเข้าทีม')
    expect(html).not.toContain('คำเชิญของฉัน')
    expect(html).not.toContain('ยังไม่มีทีม')
  })
})
