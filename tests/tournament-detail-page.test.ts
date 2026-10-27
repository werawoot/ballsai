import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

// /tournaments/[id] on the glass design: the facts the row holds, one way in when it is
// open, and a map search for the venue the organizer typed. The data boundary is the
// tournament row read.
const db = vi.hoisted(() => ({ row: null as Record<string, unknown> | null, organizers: null as unknown }))
vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.row, error: null }) }) }) }),
    rpc: async () => db.organizers ?? { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } },
  }),
}))
vi.mock('@/lib/sample-data', () => ({ sampleTournaments: [], showDemoData: false }))
vi.mock('next/navigation', () => ({ usePathname: () => '/tournaments/t1', useRouter: () => ({ push: () => {} }), useSearchParams: () => new URLSearchParams() }))
vi.mock('next-intl/server', () => ({ getLocale: async () => 'th', getTranslations: async (namespace: string) => createTranslator({ locale: 'th', messages: th, namespace: namespace as never }) }))

import TournamentPage from '@/app/tournaments/[id]/page'

const render = async () => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
  await (TournamentPage as (props: never) => Promise<ReactElement>)({ params: Promise.resolve({ id: 't1' }), searchParams: Promise.resolve({}) } as never)))
const cup = (overrides: Record<string, unknown> = {}) => ({ id: 't1', name: 'ศึกเยาวชนขอนแก่น', description: null, location: 'สนามกีฬากลาง อ.เมือง ขอนแก่น', start_date: '2026-10-24', end_date: '2026-10-25', fee: 500, max_teams: 8, promptpay: null, status: 'open', fixtures_published_at: null, ...overrides })

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-12T03:00:00Z')) })
afterEach(() => vi.useRealTimers())

describe('/tournaments/[id]', () => {
  it('says who organizes it from the approved request, and nothing before sql/89 (ADR-013)', async () => {
    db.row = cup()
    expect(await render()).not.toContain('จัดโดย')
    db.organizers = { data: [{ tournament_id: 't1', org_name: 'สโมสรเยาวชนขอนแก่น', province: 'ขอนแก่น' }], error: null }
    const html = await render()
    db.organizers = null
    expect(html).toContain('จัดโดย สโมสรเยาวชนขอนแก่น (ขอนแก่น)')
    expect(html).not.toMatch(/tel:|08\d/)
  })

  it('tells the organizer their draft is not open yet', async () => {
    db.row = cup({ status: 'draft' })
    const html = await render()
    expect(html).toContain('ร่าง: เห็นเฉพาะผู้จัดและแอดมิน')
    expect(html).not.toContain('?step=team')
  })

  it('shows the countdown and one way in while registration is open', async () => {
    db.row = cup()
    const html = await render()
    expect(html).toContain('อีก 12 วัน')
    expect(html).toContain('href="/tournaments/t1?step=team"')
    expect(html).toContain('สมัครทีม · ฿500')
  })

  it('links the venue to a map search for exactly what the organizer typed', async () => {
    db.row = cup()
    const html = await render()
    expect(html).toContain(`https://www.google.com/maps/search/?api=1&amp;query=${encodeURIComponent('สนามกีฬากลาง อ.เมือง ขอนแก่น')}`)
  })

  it('offers no way in once it is over, and no map without a venue', async () => {
    db.row = cup({ start_date: '2026-09-01', end_date: '2026-09-02', location: null })
    const html = await render()
    expect(html).not.toContain('?step=team')
    expect(html).toContain(th.tournament.finished)
    expect(html).toContain(th.tournament.noVenue)
    expect(html).not.toContain('google.com/maps')
  })

  it('says the organizer has not described it yet, rather than leaving a blank', async () => {
    db.row = cup()
    expect(await render()).toContain(th.tournament.overviewEmpty)
  })
})
