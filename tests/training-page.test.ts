import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import { TRAINING_PROGRAMS } from '@/lib/training/content'

// /training in the second reference (owner, 2 Nov 2026): tabs, and "ตารางของฉัน" with the
// week and today's programmes as a timeline of drills. The database boundary is the signed-in
// user, their age and their training rows.

const db = vi.hoisted(() => ({
  locale: 'th' as 'th' | 'en',
  user: { id: 'me' } as { id: string } | null,
  enrollments: [] as Record<string, unknown>[],
  checkins: [] as Record<string, unknown>[],
  // The current training goal (SQL95); 'missing': the table is not there yet.
  goal: null as string | null | 'missing',
  // Whether the signed-in person has an athlete profile (a coach or a guardian has none).
  athlete: true,
}))
function fakeClient() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'eq', 'order', 'gte', 'is']) builder[name] = () => builder
    builder.maybeSingle = async () => table === 'athlete_profiles'
      ? { data: db.athlete ? { user_id: 'me' } : null, error: null }
      : table === 'athlete_training_goals' && db.goal === 'missing'
      ? { data: null, error: { code: 'PGRST205' } }
      : { data: table === 'athlete_training_goals' && db.goal ? { goal_key: db.goal } : null, error: null }
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'training_enrollments' ? db.enrollments : db.checkins, error: null }).then(resolve)
    return builder
  }
  return { from, rpc: async () => ({ data: 14, error: null }), auth: { getUser: async () => ({ data: { user: db.user } }) } }
}
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => fakeClient() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fakeClient() }))
vi.mock('next/font/google', () => ({ Kaushan_Script: () => ({ className: 'font-script' }) }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => '/training', useSearchParams: () => new URLSearchParams() }))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => db.locale,
  getTranslations: async (namespace?: string) => createTranslator({ locale: db.locale, messages: messagesFor(db.locale), namespace } as never),
}))

import TrainingPage from '@/app/training/page'

const render = async (search: Record<string, string> = {}, locale: Locale = 'th') => {
  db.locale = locale
  const page = await (TrainingPage as (props: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>)({ searchParams: Promise.resolve(search) })
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: messagesFor(locale), timeZone: 'Asia/Bangkok' } as never, page))
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const today = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
const program = TRAINING_PROGRAMS.find(item => item.access === 'solo')!
const everyDay = () => {
  db.user = { id: 'me' }
  db.enrollments = [{ id: 'e1', program_id: program.id, weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: today, status: 'active' }]
  db.checkins = []
}

describe('/training tabs', () => {
  it('opens on my schedule for an athlete with a programme', async () => {
    everyDay()
    const html = await render()
    expect(text(html)).toContain('ตารางของฉัน')
    expect(html).toMatch(/aria-current="page"[^>]*>ตารางของฉัน</)
    expect(html).toContain('tg-weekstrip')
  })

  it('opens on the programmes without a programme, and offers no schedule tab', async () => {
    db.user = null
    db.enrollments = []
    const html = await render()
    expect(text(html)).not.toContain('ตารางของฉัน')
    expect(html).toMatch(/aria-current="page"[^>]*>โปรแกรมแนะนำ</)
    expect(html).toContain('tg-programs')
    expect(html).not.toContain('tg-drills"')
  })

  it('shows the drills by skill on their own tab', async () => {
    db.user = null
    const html = await render({ tab: 'skills' })
    expect(html).toContain('tg-skills')
    expect(html).toContain('tg-drills')
    expect(html).not.toContain('tg-programs')
  })
})

describe('/training my schedule', () => {
  it('lists today\'s programme with every drill, and one green start', async () => {
    everyDay()
    const html = await render()
    const page = text(html)
    expect(page).toContain('0/1 เสร็จแล้ว')
    expect(html).toContain(`href="/training/${program.id}/session"`)
    expect((html.match(/tg-session-start is-primary/g) ?? []).length).toBe(1)
    expect((html.match(/<ol class="tg-timeline">[\s\S]*?<\/ol>/)?.[0].match(/<li>/g) ?? []).length).toBe(program.drills.length)
    // The add button steps back while a session waits.
    expect(html).not.toContain('tg-add is-primary')
  })

  it('marks today done once checked in, and the add button takes the lead', async () => {
    everyDay()
    db.checkins = [{ enrollment_id: 'e1', session_date: today }]
    const html = await render()
    expect(text(html)).toContain('1/1 เสร็จแล้ว')
    expect(html).toContain('tg-session is-done')
    expect(html).not.toContain('/session"')
    expect(html).toContain('tg-add is-primary')
  })

  it('says rest day when nothing is planned today', async () => {
    everyDay()
    const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7
    db.enrollments = [{ ...db.enrollments[0], weekdays: [(weekday + 1) % 7] }]
    const page = text(await render())
    expect(page).toContain('วันนี้วันพัก')
    expect(page).toContain('ครั้งต่อไป')
  })

  it('says done counts are self-reported', async () => {
    everyDay()
    expect(text(await render()).replace(/&quot;/g, '"')).toContain('นับจากที่คุณกด "ซ้อมเสร็จ" เอง')
  })

  it('speaks English without Thai on my schedule', async () => {
    everyDay()
    const page = text(await render({}, 'en')).replace(/ไทย/g, '')
    expect(page).toContain('My schedule')
    const schedule = page.slice(page.indexOf('My schedule'))
    expect(schedule).not.toMatch(/[ก-ฺเ-๛]/)
  })
})

describe('/training goal step (ADR-015)', () => {
  it('asks a signed-in athlete for a goal before the programmes, with the four choices', async () => {
    db.user = { id: 'me' }; db.enrollments = []; db.checkins = []; db.goal = null
    const html = await render({ tab: 'programs' })
    const page = text(html)
    expect(page).toContain('เป้าหมายของคุณคืออะไร')
    for (const label of ['คุมบอลดีขึ้น', 'แข็งแรงขึ้น ลดการบาดเจ็บ', 'เร็วและคล่องตัวขึ้น', 'ซ้อมให้สม่ำเสมอ']) expect(page).toContain(label)
    expect(html.indexOf('tg-goal-pick')).toBeLessThan(html.indexOf('tg-programs'))
  })

  it('shows the goal, marks the programmes that fit it and lists them first', async () => {
    db.user = { id: 'me' }; db.enrollments = []; db.checkins = []; db.goal = 'strength'
    const html = await render({ tab: 'programs', band: 'u14_u17' })
    const page = text(html)
    expect(page).toContain('เป้าหมาย: แข็งแรงขึ้น ลดการบาดเจ็บ')
    expect(html).not.toContain('tg-goal-pick')
    const programs = html.slice(html.indexOf('tg-programs'))
    expect(programs.indexOf('/training/u14-prevention-01')).toBeLessThan(programs.indexOf('/training/u14-game-skills-01'))
    expect(text(programs)).toContain('ตรงกับเป้าหมาย')
  })

  it('opens the choices again to change the goal', async () => {
    db.goal = 'strength'
    expect(await render({ tab: 'programs', goal: 'change' })).toContain('tg-goal-pick')
  })

  it('skips the step for a visitor, and before SQL95 is applied', async () => {
    db.goal = null; db.user = null
    expect(await render({ tab: 'programs' })).not.toContain('tg-goal-pick')
    db.user = { id: 'me' }; db.goal = 'missing'
    expect(await render({ tab: 'programs' })).not.toContain('tg-goal-pick')
    db.goal = null
  })

  it('skips the step for a coach or a guardian, who has no athlete profile to save it to', async () => {
    db.user = { id: 'me' }; db.goal = null; db.athlete = false
    expect(await render({ tab: 'programs' })).not.toContain('tg-goal-pick')
    db.athlete = true
  })

  it('keeps the age band after a goal is saved', async () => {
    db.user = { id: 'me' }; db.goal = null; db.enrollments = []
    const html = await render({ tab: 'programs', band: 'u14_u17' })
    expect(html).toContain('data-return="/training?band=u14_u17&amp;tab=programs"')
  })
})
