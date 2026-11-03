import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// /card in the second reference (owner, 2 Nov 2026): under the card, the level and this
// season's verified numbers; nothing before a confirmed match.

const db = vi.hoisted(() => ({ locale: 'th' as 'th' | 'en', tables: {} as Record<string, unknown> }))
function fakeClient() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'eq']) builder[name] = () => builder
    builder.maybeSingle = async () => ({ data: db.tables[table] ?? null, error: null })
    return builder
  }
  return {
    from,
    storage: { from: () => ({ createSignedUrls: async () => ({ data: [], error: null }) }) },
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
  }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) }, useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/card' }))
vi.mock('@vercel/analytics', () => ({ track: () => {} }))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => db.locale,
  getTranslations: async (namespace?: string) => createTranslator({ locale: db.locale, messages: messagesFor(db.locale), namespace } as never),
}))

import CardPage from '@/app/card/page'

const render = async (locale: Locale = 'th') => {
  db.locale = locale
  const page = await (CardPage as () => Promise<ReactElement>)()
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: messagesFor(locale), timeZone: 'Asia/Bangkok' } as never, page))
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const athlete = { display_name: 'Niran', position: 'MF', province: 'Lopburi', current_team: 'Lopburi FC', profile_image_url: null, verification_level: 'performance_verified', is_public: true }

describe('/card summary under the card', () => {
  it('shows the level and this season\'s confirmed numbers', async () => {
    db.tables = {
      athlete_profiles: athlete,
      player_ranks: { id: 'r1', player_name: 'Niran', position: 'MF', ovr: 64, pac: null, sho: null, pas: null, dri: null, def: null },
      player_ratings: { power_rating: 1015, matches_played: 12, goals: 8, assists: 5, mvps: 3 },
      athlete_progress: { xp_total: 240, current_level: 2 },
    }
    const page = text(await render())
    expect(page).toContain('ระดับ 2')
    expect(page).toContain('240 / 400 แต้ม')
    expect(page).toMatch(/12 แข่ง 8 ประตู 5 แอสซิสต์ 3 ยอดเยี่ยม/)
    expect(page).toContain('จากผลแข่งที่ผู้จัดยืนยันเท่านั้น')
  })

  it('shows no numbers before a confirmed match, and says when they start', async () => {
    db.tables = { athlete_profiles: athlete }
    const html = await render()
    expect(text(html)).toContain('แต้มเริ่มนับตั้งแต่นัดแรกที่ผู้จัดยืนยันผล')
    expect(text(html)).toContain('ยังไม่มีผลแข่งที่ยืนยันในฤดูกาลนี้')
    expect(html).not.toContain('pc-level-bar')
  })

  it('speaks English without Thai in the summary', async () => {
    db.tables = { athlete_profiles: athlete, player_ranks: { id: 'r1', player_name: 'Niran', position: 'MF', ovr: 64 }, player_ratings: { power_rating: 1015, matches_played: 2, goals: 1, assists: 0, mvps: 0 }, athlete_progress: { xp_total: 240, current_level: 2 } }
    const html = await render('en')
    const summary = text(html.slice(html.indexOf('pc-summary'), html.indexOf('pc-season-note') + 300))
    expect(summary).toContain('Season')
    expect(summary).not.toMatch(/[ก-ฺเ-๛]/)
  })
})
