import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import { isPrivatePath } from '@/lib/seo'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// /progress/tests, the three self-tests (owner, 10 and 11 Nov 2026; sql/96).

const db = vi.hoisted(() => ({ user: 'me' as string | null, birth: '2012-01-01' as string | null, rows: [] as { test_key: string; value: number; test_date: string }[], missing: false, athlete: true, reads: [] as string[] }))
function fakeClient() {
  const from = (table: string) => {
    const filters: Record<string, unknown> = {}
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (column: string, value: unknown) => { filters[column] = value; return builder }
    builder.order = () => builder
    builder.limit = (n: number) => { db.reads.push(`${table}:${String(filters.test_key)}:limit ${n}`); return builder }
    builder.maybeSingle = async () => ({ data: db.athlete ? { user_id: 'me' } : null, error: null })
    builder.then = (resolve: (value: unknown) => unknown) => {
      if (db.missing) return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(resolve)
      return Promise.resolve({ data: db.rows.filter(row => row.test_key === filters.test_key).sort((a, b) => b.test_date.localeCompare(a.test_date)).slice(0, 2), error: null }).then(resolve)
    }
    return builder
  }
  const rpc = async (name: string) => name === 'my_athlete_private' ? { data: [{ birth_date: db.birth, guardian_consent_at: null }], error: null } : { data: null, error: { code: 'XX' } }
  return { from, rpc, auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  notFound: () => { throw new Error('not found') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/progress/tests',
}))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
let locale: Locale = 'th'
vi.mock('next-intl/server', () => ({
  getLocale: async () => locale,
  getTranslations: async (namespace?: string) => createTranslator({ locale, messages: messagesFor(locale), namespace } as never),
}))

import SelfTestsPage from '@/app/progress/tests/page'
import { TestCard } from '@/app/progress/tests/SelfTestRunner'

const render = async (to: Locale = 'th') => {
  locale = to
  const page = await (SelfTestsPage as () => Promise<ReactElement>)()
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: to, messages: messagesFor(to), timeZone: 'Asia/Bangkok' } as never, page))
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')

describe('/progress/tests', () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_SELF_TESTS; db.user = 'me'; db.missing = false; db.athlete = true; db.rows = []; db.birth = '2012-01-01'; db.reads = [] })

  it('does not exist while the coach review is pending (flag off), and is never indexed', async () => {
    await expect(render()).rejects.toThrow('not found')
    expect(isPrivatePath('/progress/tests')).toBe(true)
  })

  it('asks a signed-out visitor to sign in', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    db.user = null
    await expect(render()).rejects.toThrow('redirect /login?next=/progress/tests')
  })

  it('asks the pain question first, says the rules, and marks the tests as a draft', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    const page = text(await render())
    expect(page).toContain('ตอนนี้มีอาการเจ็บไหม?')
    expect(page).toContain('คำตอบนี้ไม่ถูกเก็บไว้')
    expect(page).toContain('ร่าง · รอโค้ชตรวจ')
    expect(page).toContain('ไม่แสดงบนการ์ด')
    expect(page).toContain('ไม่นับเป็นคะแนนฝีมือ')
    expect(page).not.toContain('เดาะบอล</h2>')
  })

  it('reads two rows per test, never the whole history', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    await render()
    expect(db.reads.sort()).toEqual(['athlete_self_tests:juggling:limit 2', 'athlete_self_tests:long_jump:limit 2', 'athlete_self_tests:plank:limit 2'])
  })

  it('says it is not ready before SQL96, and for someone without an athlete profile', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    db.missing = true
    expect(text(await render())).toContain('ยังเปิดใช้แบบทดสอบไม่ได้ในตอนนี้')
    db.missing = false
    db.athlete = false
    expect(text(await render())).toContain('ยังเปิดใช้แบบทดสอบไม่ได้ในตอนนี้')
  })
})

describe('the self-test cards', () => {
  const card = (over: Record<string, unknown>) => ({ key: 'juggling', open: true, min: 0, max: 1000, minAge: null, unit: 'touches', latest: null, previous: null, change: null, nextDue: '2026-11-11', due: true, testedToday: false, ...over })
  const show = (cards: unknown[]) => {
    // The cards behind the pain gate ("no pain" is a client tap), rendered one by one.
    const day = (value: string) => value
    const html = renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
      ...cards.map((item, index) => createElement(TestCard as ComponentType<never>, { key: index, card: item, day } as never))))
    return text(html)
  }

  it('show the last result against the one before, labelled as entered by the athlete', () => {
    const page = show([card({ latest: { test_key: 'juggling', value: 20, test_date: '2026-10-29' }, previous: { test_key: 'juggling', value: 12, test_date: '2026-10-01' }, change: 8, nextDue: '2026-11-26', due: false })])
    expect(page).toContain('ครั้งล่าสุด 20 ครั้ง')
    expect(page).toContain('ฉันกรอกเอง')
    expect(page).toContain('ดีขึ้น 8 ครั้ง จากครั้งก่อน')
    expect(page).toContain('ทดสอบครั้งต่อไปได้ตั้งแต่')
  })

  it('say a lower number kindly, and close the long jump under 12', () => {
    const page = show([
      card({ key: 'plank', unit: 'seconds', max: 120, latest: { test_key: 'plank', value: 40, test_date: '2026-11-11' }, previous: { test_key: 'plank', value: 50, test_date: '2026-10-10' }, change: -10, testedToday: true }),
      card({ key: 'long_jump', unit: 'cm', min: 10, max: 400, minAge: 12, open: false }),
    ])
    expect(page).toContain('น้อยกว่าครั้งก่อน 10 วินาที ไม่เป็นไร')
    expect(page).toContain('แก้ผลของวันนี้')
    expect(page).toContain('ลบผลของวันนี้')
    expect(page).toContain('สำหรับอายุ 12 ปีขึ้นไป')
  })
})

describe('the long jump on the page', () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_SELF_TESTS; db.birth = '2012-01-01' })

  it('takes the birth date from my_athlete_private, never from the table', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    const { fetchMySelfTests } = await import('@/lib/training/self-test-data')
    db.birth = '2016-05-01'
    const mine = await fetchMySelfTests(fakeClient() as never, 'me')
    expect(mine).toMatchObject({ available: true, birthDate: '2016-05-01' })
  })
})
