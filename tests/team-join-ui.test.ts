import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

const db = vi.hoisted(() => ({ preview: [] as unknown[], user: null as null | { id: string } }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  notFound: () => { throw new Error('notFound') },
  usePathname: () => '/join/x',
}))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    rpc: async () => ({ data: db.preview, error: null }),
    auth: { getUser: async () => ({ data: { user: db.user } }) },
  }),
}))
vi.mock('next-intl/server', () => ({
  getTranslations: async (namespace: string) => (key: string) => key.split('.').reduce<unknown>((value, part) => (value as Record<string, unknown>)[part], (th as Record<string, unknown>)[namespace]),
}))

import JoinLinkPanel from '@/app/team-members/[teamId]/JoinLinkPanel'
import JoinRequestsPanel from '@/app/team-members/[teamId]/JoinRequestsPanel'
import LeaveTeamButton from '@/app/team-members/LeaveTeamButton'
import JoinTeamPage from '@/app/join/[token]/page'

const intl = (child: ReactElement) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>,
  { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, child))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const TOKEN = '0123456789abcdef0123456789abcdef'
const URL_ = `https://ballsai.example/join/${TOKEN}`

beforeEach(() => { db.preview = []; db.user = null })

// ADR-011: the coach's join link card, the request list, leaving, and the join page.
describe('the coach\'s join link', () => {
  it('shows the link with copy, LINE and QR, and lets the coach renew or close it', () => {
    const html = intl(createElement(JoinLinkPanel, { teamId: 't', teamName: 'ขอนแก่น U13', url: URL_, open: true }))
    expect(html).toContain(`value="${URL_}"`)
    expect(html).toContain('href="https://line.me/R/share?text=')
    expect(decodeURIComponent(html.match(/share\?text=([^"]+)/)![1].replace(/&amp;/g, '&'))).toContain(URL_)
    for (const label of [th.teamJoin.copy, th.teamJoin.qr, th.teamJoin.rotate, th.teamJoin.close]) expect(text(html)).toContain(label)
  })
  it('says when requests are stopped, and offers to take them again', () => {
    const page = text(intl(createElement(JoinLinkPanel, { teamId: 't', teamName: 'T', url: URL_, open: false })))
    expect(page).toContain(th.teamJoin.closedNote)
    expect(page).toContain(th.teamJoin.open)
  })
  it('says the feature is not on yet before sql/83', () => {
    expect(text(intl(createElement(JoinLinkPanel, { teamId: 't', teamName: 'T', url: null, open: false })))).toContain(th.teamJoin.notReady)
  })
})

describe('requests to join', () => {
  it('shows only name, position and birth year, with accept and decline', () => {
    const page = text(intl(createElement(JoinRequestsPanel, { rows: [{ request_id: 'r', display_name: 'ด.ช. ต้น', athlete_position: 'MF', birth_year: 2013, created_at: '2026-10-18T00:00:00Z' }] })))
    expect(page).toContain('ด.ช. ต้น')
    expect(page).toContain('MF · เกิดปี 2013')
    expect(page).toContain(th.teamJoin.accept)
    expect(page).toContain(th.teamJoin.decline)
  })
  it('says how to start when there are none', () => {
    expect(text(intl(createElement(JoinRequestsPanel, { rows: [] })))).toContain(th.teamJoin.noRequests)
  })
})

describe('leaving a team', () => {
  it('asks before leaving', () => {
    expect(text(intl(createElement(LeaveTeamButton, { memberId: 'm', teamName: 'T' })))).toContain(th.teamJoin.leave)
  })
})

describe('/join/[token]', () => {
  const render = async (ask?: string) => intl(await JoinTeamPage({ params: Promise.resolve({ token: TOKEN }), searchParams: Promise.resolve({ ask }) }) as ReactElement)
  it('refuses a malformed token', async () => {
    await expect(JoinTeamPage({ params: Promise.resolve({ token: 'abc' }), searchParams: Promise.resolve({}) })).rejects.toThrow('notFound')
  })
  it('shows team, coach and province to a signed-out visitor, and sends sign-in back here', async () => {
    db.preview = [{ team_name: 'ขอนแก่น U13', coach_name: 'โค้ชท็อป', province: 'ขอนแก่น', open: true }]
    const html = await render()
    expect(text(html)).toContain('ขอนแก่น U13')
    expect(text(html)).toContain('โค้ชท็อป')
    expect(text(html)).toContain(th.joinPage.privacy)
    expect(html).toContain(`href="/login?next=${encodeURIComponent(`/join/${TOKEN}?ask=1`)}"`)
  })
  it('offers the request button to a signed-in visitor', async () => {
    db.preview = [{ team_name: 'T', coach_name: null, province: null, open: true }]
    db.user = { id: 'u' }
    expect(text(await render('1'))).toContain(th.joinPage.ask)
  })
  it('says when the team is not taking requests, or the link is gone', async () => {
    db.preview = [{ team_name: 'T', coach_name: null, province: null, open: false }]
    expect(text(await render())).toContain(th.joinPage.closed)
    db.preview = []
    expect(text(await render())).toContain(th.joinPage.goneTitle)
  })
})
