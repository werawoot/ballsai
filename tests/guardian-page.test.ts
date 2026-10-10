import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

const db = vi.hoisted(() => ({ persona: 'guardian' as string | null, events: null as Record<string, unknown>[] | null, news: null as Record<string, unknown>[] | null, plans: null as Record<string, unknown>[] | null }))
function fakeClient() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const name of ['eq', 'order', 'limit', 'select']) builder[name] = () => builder
    builder.maybeSingle = async () => ({ data: table === 'profiles' ? { onboarding_persona: db.persona } : null, error: null })
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    return builder
  }
  // my_upcoming_team_events (sql/70) and my_team_announcements (sql/71): missing until
  // the file is applied, unless a test seeds rows.
  const rpc = async (name: string) => {
    const rows = name === 'my_team_announcements' ? db.news : name === 'my_team_training_plans' ? db.plans : db.events
    return rows ? { data: rows, error: null } : { data: null, error: { code: 'PGRST202', message: 'missing' } }
  }
  return { from, rpc, auth: { getUser: async () => ({ data: { user: { id: 'me', email: 'parent@example.com' } } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/guardian',
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'th', messages: th, namespace } as never),
}))

import GuardianPage from '@/app/guardian/page'

// UX report 8, mockup 5: the page says what it is for in the first line, in plain words.
const render = async (page: () => Promise<ReactElement>) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, await page()))
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('/guardian heading', () => {
  it('says "เชื่อมกับบัญชีของลูก" and what it gives the parent', async () => {
    const page = text(await render(GuardianPage as never))
    expect(page).toContain('เชื่อมกับบัญชีของลูก')
    expect(page).toContain('ดูความก้าวหน้าของลูกได้ หลังลูกกดยอมรับ')
  })
  it('has no decorative English label or the old vague title', async () => {
    const page = text(await render(GuardianPage as never))
    expect(page).not.toContain('FAMILY SUPPORT')
    expect(page).not.toContain('ผู้ปกครองดูแลเส้นทาง')
  })
  it('goes back to ของฉัน', async () => {
    const page = text(await render(GuardianPage as never))
    expect(page).toContain('ของฉัน')
  })
})

// Chrome test, 8 Oct 2026: someone who chose another role landed here and was told to "เริ่ม
// onboarding ใหม่" with nothing to press. They get one button that lets them choose again.
describe('/guardian for someone who did not choose ผู้ปกครอง', () => {
  it('says who the page is for and gives a button to change role, with no English', async () => {
    db.persona = 'athlete'
    const html = await render(GuardianPage as never)
    db.persona = 'guardian'
    expect(text(html)).toContain(th.guardianPage.notGuardian.body)
    expect(html).toMatch(/<a[^>]*href="\/welcome\?again=1"[^>]*>[^<]*เปลี่ยนบทบาท/)
    expect(text(html)).not.toMatch(/onboarding/i)
  })
  it('a guardian does not see it', async () => {
    const html = await render(GuardianPage as never)
    expect(html).not.toContain('/welcome?again=1')
  })
})

describe('/guardian team events (sql/70)', () => {
  it("lists a child's upcoming event with its own answer buttons", async () => {
    db.persona = 'guardian'
    db.events = [{ event_id: 'e1', team_id: 't1', team_name: 'ขอนแก่น U13', kind: 'match', title: 'นัดกระชับมิตร', starts_at: '2026-10-18T02:00:00Z', location: null, note: null, athlete_id: 'child', athlete_name: 'ปาล์ม', answer: null }]
    const html = await render(GuardianPage as () => Promise<ReactElement>)
    db.events = null
    expect(html).toContain('นัดกระชับมิตร')
    expect(html).toContain('สำหรับ ปาล์ม')
    expect(html).toContain(th.teamEvents.yes)
  })

  it('shows no event section before SQL70 is applied', async () => {
    db.events = null
    expect(await render(GuardianPage as () => Promise<ReactElement>)).not.toContain(th.teamEvents.myTitle)
  })
})

describe('/guardian team announcements (sql/71)', () => {
  it("shows a message from the child's team", async () => {
    db.persona = 'guardian'
    db.news = [{ id: 'n1', team_name: 'ขอนแก่น U13', body: 'งดซ้อมวันเสาร์ ฝนตก', created_at: '2026-10-12T09:00:00Z', read_at: null }]
    const html = await render(GuardianPage as () => Promise<ReactElement>)
    db.news = null
    expect(html).toContain('งดซ้อมวันเสาร์ ฝนตก')
    expect(html).toContain('ทีม ขอนแก่น U13')
  })
})

describe('/guardian team training plan (sql/72)', () => {
  it("shows the child's team plan for this week", async () => {
    const { weekStartOf, weekdayOf } = await import('@/lib/team-training')
    db.persona = 'guardian'
    db.plans = [{ team_id: 't1', team_name: 'ขอนแก่น U13', week_start: weekStartOf(Date.now()), days: [{ day: weekdayOf(Date.now()), title: 'บอลติดเท้า', blocks: [{ drill: null, name: 'เลี้ยงบอลผ่านกรวย', minutes: 15, load: 2 }] }] }]
    const html = await render(GuardianPage as () => Promise<ReactElement>)
    db.plans = null
    expect(html).toContain(th.teamTraining.myTitle)
    expect(html).toContain('เลี้ยงบอลผ่านกรวย')
  })
})

