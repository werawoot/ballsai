import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

// /tournaments: the next tournament leads the page with how far off it is and one way in;
// the rest follow by month. The data boundary is the cached page read.
const db = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }))
vi.mock('@/lib/public-data', () => ({ getPublicTournamentsPage: async () => ({ tournaments: db.rows, hasNext: false }) }))
vi.mock('@/lib/sample-data', () => ({ sampleTournaments: [], isSampleId: () => false, showDemoData: false }))
vi.mock('next/navigation', () => ({ usePathname: () => '/tournaments', useRouter: () => ({ push: () => {} }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'th', getTranslations: async (namespace: string) => createTranslator({ locale: 'th', messages: th, namespace: namespace as never }) }))

import TournamentsPage from '@/app/tournaments/page'

const render = async (view?: string) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
  await (TournamentsPage as (props: never) => Promise<ReactElement>)({ searchParams: Promise.resolve(view ? { view } : {}) } as never)))
const cup = (id: string, name: string, start: string, status = 'open', fee = 0) => ({ id, name, description: null, location: 'สนามกีฬากลาง ขอนแก่น', start_date: start, end_date: start, fee, max_teams: 8, status })
const spotlight = (html: string) => html.slice(html.indexOf('id="tn-next"'), html.indexOf('</section>', html.indexOf('id="tn-next"')))

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T03:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('/tournaments', () => {
  it('leads with the next tournament: how many days to go and one way in, not repeated below', async () => {
    db.rows = [cup('t1', 'ศึกเยาวชนขอนแก่น', '2026-10-24'), cup('t2', 'โคราชคัพ', '2026-11-09', 'open', 500)]
    const html = await render()
    const next = spotlight(html)
    expect(next).toContain('ศึกเยาวชนขอนแก่น')
    expect(next).toContain('อีก 12 วัน')
    expect(next).toMatch(/href="\/tournaments\/t1"[^>]*>[\s\S]*ดูรายละเอียดและสมัคร/)
    expect(html.match(/ศึกเยาวชนขอนแก่น/g)).toHaveLength(1)
    expect(html).toContain('โคราชคัพ')
    expect(html).toContain('฿500')
  })

  it('says a tournament already under way is on now, and one that is not open only offers the details', async () => {
    db.rows = [cup('t1', 'ลีกยาว', '2026-10-01', 'closed')]
    const next = spotlight(await render())
    expect(next).toContain(th.tournaments.live)
    expect(next).toContain(th.tournaments.spotlightView)
    expect(next).not.toContain(th.tournaments.spotlightOpen)
  })

  it('shows no lead card on the finished tab', async () => {
    db.rows = [cup('t9', 'รายการที่จบแล้ว', '2026-09-01', 'closed')]
    const html = await render('past')
    expect(html).not.toContain('id="tn-next"')
    expect(html).toContain('รายการที่จบแล้ว')
  })

  it('tells an organizer where to create a tournament, also when the list is not empty', async () => {
    db.rows = [cup('t1', 'ศึกเยาวชนขอนแก่น', '2026-10-24')]
    const html = await render()
    expect(html).toContain(th.tournaments.organizerTitle)
    expect(html).toContain('href="/dashboard"')
  })
})
