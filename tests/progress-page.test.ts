import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import { isPrivatePath } from '@/lib/seo'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// /progress, the athlete's Progress tab (ADR-015, owner 8 Nov 2026): only what was recorded.

const db = vi.hoisted(() => ({ locale: 'th' as 'th' | 'en', lists: {} as Record<string, unknown[]>, missing: false, user: 'me' as string | null }))
function fakeClient() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'order', 'gte']) builder[name] = () => builder
    builder.range = (start: number) => { (builder as { start?: number }).start = start; return builder }
    builder.then = (resolve: (value: unknown) => unknown) => {
      if (db.missing) return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(resolve)
      const start = (builder as { start?: number }).start ?? 0
      return Promise.resolve({ data: (db.lists[table] ?? []).slice(start, start + 1000), error: null }).then(resolve)
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) }, useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/progress' }))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => db.locale,
  getTranslations: async (namespace?: string) => createTranslator({ locale: db.locale, messages: messagesFor(db.locale), namespace } as never),
}))

import ProgressPage from '@/app/progress/page'

const render = async (locale: Locale = 'th') => {
  db.locale = locale
  const page = await (ProgressPage as () => Promise<ReactElement>)()
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: messagesFor(locale), timeZone: 'Asia/Bangkok' } as never, page))
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)

describe('/progress', () => {
  it('asks a signed-out visitor to sign in, and is never indexed', async () => {
    db.user = null
    await expect(render()).rejects.toThrow('redirect /login?next=/progress')
    db.user = 'me'
    expect(isPrivatePath('/progress')).toBe(true)
  })

  it('shows recorded sessions, minutes and effort points, labelled as self-recorded', async () => {
    db.missing = false
    db.lists = {
      training_enrollments: [{ id: 'a', program_id: 'u14-prevention-01', weekdays: [0, 2, 4], start_date: today, status: 'active' }],
      training_checkins: [{ enrollment_id: 'a', session_date: today }],
    }
    const page = text(await render())
    expect(page).toContain('1 ครั้ง')
    expect(page).toContain('20 นาที')
    expect(page).toContain('50 แต้มขยัน')
    expect(page).toContain('บันทึกเอง')
  })

  it('reads every check-in, past the 1,000-row page', async () => {
    const days = Array.from({ length: 1200 }, (_, index) => ({ enrollment_id: 'a', session_date: new Date(Date.UTC(2020, 0, 1 + index)).toISOString().slice(0, 10) }))
    db.lists = { training_enrollments: [{ id: 'a', program_id: 'u14-prevention-01', weekdays: [0, 2, 4], start_date: '2020-01-01', status: 'completed' }], training_checkins: days }
    expect(text(await render())).toContain('1,200 ครั้ง')
  })

  it('invites a new athlete to pick a programme, with no chart of nothing', async () => {
    db.lists = {}
    const html = await render()
    expect(text(html)).toContain('เลือกโปรแกรมฝึก')
    expect(html).toContain('href="/training"')
    expect(html).not.toContain('pg-weeks')
  })

  it('says when training is not switched on yet', async () => {
    db.missing = true
    expect(text(await render())).toContain('SQL63')
    db.missing = false
  })

  it('speaks English without Thai', async () => {
    db.lists = { training_enrollments: [{ id: 'a', program_id: 'u14-prevention-01', weekdays: [0, 2, 4], start_date: today, status: 'active' }], training_checkins: [{ enrollment_id: 'a', session_date: today }] }
    const html = await render('en')
    // The header's language switch says ไทย on purpose; the page body is checked.
    expect(text(html.slice(html.indexOf('pg-title')))).not.toMatch(/[ก-ฺเ-๛]/)
  })
})
