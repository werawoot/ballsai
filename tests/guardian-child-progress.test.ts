import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import { isPrivatePath } from '@/lib/seo'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// /guardian/[athleteId]/progress (owner, 12 Nov 2026): an accepted guardian sees their child's
// home training, goal and (behind the self-test flag) self-test results, read only.

const CHILD = '22222222-2222-4222-8222-222222222222'
const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)
const db = vi.hoisted(() => ({
  user: 'guardian' as string | null,
  linked: true,
  goal: 'ball_control' as string | null,
  goalMissing: false,
  trainingMissing: false,
  lists: {} as Record<string, unknown[]>,
  tests: [] as { test_key: string; value: number; test_date: string }[],
  reads: [] as string[],
}))
function fakeClient() {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'order', 'is', 'limit']) builder[name] = () => builder
    builder.not = (column: string, op: string, value: unknown) => { filters[`not.${column}`] = `${op}.${String(value)}`; return builder }
    builder.eq = (column: string, value: unknown) => { filters[column] = value; return builder }
    builder.range = () => builder
    builder.maybeSingle = async () => {
      db.reads.push(`${table}:${JSON.stringify(filters)}`)
      if (table === 'guardian_links') return { data: db.linked && filters.guardian_id === 'guardian' && filters.athlete_id === CHILD && filters.status === 'accepted' && filters['not.consent_at'] === 'is.null' ? { athlete_id: CHILD, athlete_profiles: { display_name: 'น้องบอล' } } : null, error: null }
      if (table === 'athlete_training_goals') return db.goalMissing ? { data: null, error: { code: 'PGRST205' } } : { data: db.goal ? { goal_key: db.goal } : null, error: null }
      return { data: null, error: null }
    }
    builder.then = (resolve: (value: unknown) => unknown) => {
      db.reads.push(`${table}:${JSON.stringify(filters)}`)
      if (table === 'athlete_self_tests') return Promise.resolve({ data: db.tests.filter(row => row.test_key === filters.test_key), error: null }).then(resolve)
      if (db.trainingMissing && table.startsWith('training_')) return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(resolve)
      return Promise.resolve({ data: db.lists[table] ?? [], error: null }).then(resolve)
    }
    return builder
  }
  const rpc = async () => ({ data: null, error: { code: 'XX' } })
  return { from, rpc, auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  notFound: () => { throw new Error('not found') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/guardian',
}))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'th', messages: messagesFor('th'), namespace } as never),
}))

import GuardianChildProgressPage from '@/app/guardian/[athleteId]/progress/page'

const render = async (athleteId = CHILD) => {
  const page = await (GuardianChildProgressPage as (props: { params: Promise<{ athleteId: string }> }) => Promise<ReactElement>)({ params: Promise.resolve({ athleteId }) })
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, page))
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('/guardian/[athleteId]/progress', () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SELF_TESTS
    Object.assign(db, { user: 'guardian', linked: true, goal: 'ball_control', goalMissing: false, trainingMissing: false, lists: {}, tests: [], reads: [] })
  })

  it('asks a signed-out visitor to sign in, and is never indexed', async () => {
    db.user = null
    await expect(render()).rejects.toThrow(`redirect /login?next=${encodeURIComponent(`/guardian/${CHILD}/progress`)}`)
    expect(isPrivatePath(`/guardian/${CHILD}/progress`)).toBe(true)
  })

  it('is a 404 for anyone who is not an accepted guardian of this child, and for a malformed id', async () => {
    db.linked = false
    await expect(render()).rejects.toThrow('not found')
    db.linked = true
    db.reads = []
    await expect(render('not-a-uuid')).rejects.toThrow('not found')
    expect(db.reads).toEqual([])
  })

  it("shows the child's home training and goal, read only and labelled as self-recorded", async () => {
    db.lists = {
      training_enrollments: [{ id: 'a', program_id: 'u14-prevention-01', weekdays: [0, 2, 4], start_date: today, status: 'active' }],
      training_checkins: [{ enrollment_id: 'a', session_date: today }],
    }
    const html = await render()
    const page = text(html)
    expect(page).toContain('พัฒนาการของ น้องบอล')
    expect(page).toContain('1 ครั้ง')
    expect(page).toContain('ลูกบันทึกเอง')
    expect(page).toContain(th.training.goals.options.ball_control.label)
    // Nothing in the page body writes: no form, button or input (the header has its own controls).
    expect(html.slice(html.indexOf('pf-shell'))).not.toMatch(/<form|<button|<input|<textarea/)
    // Every child-data read is for this child, never for the guardian.
    for (const read of db.reads.filter(entry => !entry.startsWith('guardian_links'))) expect(read).toContain(CHILD)
  })

  it('shows self-test results only while the self-test flag is on', async () => {
    db.tests = [{ test_key: 'juggling', value: 20, test_date: today }, { test_key: 'juggling', value: 12, test_date: '2026-10-01' }]
    expect(text(await render())).not.toContain('แบบทดสอบตัวเอง')
    expect(db.reads.some(read => read.startsWith('athlete_self_tests'))).toBe(false)
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    const page = text(await render())
    expect(page).toContain('แบบทดสอบตัวเอง')
    expect(page).toContain('ครั้งล่าสุด 20 ครั้ง')
    expect(page).toContain('ดีขึ้น 8 ครั้ง')
    expect(page).toContain('ร่าง · รอโค้ชตรวจ')
  })

  it('tells a parent in plain words when goals or training are not switched on yet', async () => {
    db.goalMissing = true
    db.trainingMissing = true
    const page = text(await render())
    expect(page).toContain('เป้าหมายที่ลูกตั้งไว้ ส่วนนี้ยังเปิดใช้ไม่ได้ในตอนนี้')
    expect(page).not.toContain('SQL')
  })
})
