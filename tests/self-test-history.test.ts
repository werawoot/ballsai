import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { afterEach, describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

// /progress/tests/history (owner, 13 Nov 2026): every result of one self-test, a page at a time,
// each deletable by the athlete. Hidden with the tests until the coach sign-off.

const db = vi.hoisted(() => ({ user: 'me' as string | null, rows: [] as { test_key: string; value: number; test_date: string }[], reads: [] as Record<string, unknown>[], missing: false }))
function fakeClient() {
  const from = (table: string) => {
    const read: Record<string, unknown> = { table }
    const builder: Record<string, unknown> = {}
    builder.select = () => builder
    builder.eq = (column: string, value: unknown) => { read[column] = value; return builder }
    builder.lt = (column: string, value: unknown) => { read[`${column}<`] = value; return builder }
    builder.order = () => builder
    builder.limit = (n: number) => { read.limit = n; return builder }
    builder.then = (resolve: (value: unknown) => unknown) => {
      db.reads.push(read)
      if (db.missing) return Promise.resolve({ data: null, error: { code: 'PGRST205' } }).then(resolve)
      const rows = db.rows.filter(row => row.test_key === read.test_key && (!read['test_date<'] || row.test_date < (read['test_date<'] as string)))
        .sort((a, b) => b.test_date.localeCompare(a.test_date)).slice(0, read.limit as number)
      return Promise.resolve({ data: rows, error: null }).then(resolve)
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: db.user ? { id: db.user } : null } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  notFound: () => { throw new Error('not found') },
  useRouter: () => ({ refresh: () => {}, push: () => {} }),
  usePathname: () => '/progress/tests/history',
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'th', messages: th, namespace } as never),
}))

import SelfTestHistoryPage from '@/app/progress/tests/history/page'

const render = async (params: { test?: string; before?: string }) => {
  const page = await (SelfTestHistoryPage as (props: { searchParams: Promise<typeof params> }) => Promise<ReactElement>)({ searchParams: Promise.resolve(params) })
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, page))
}
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ')
const days = (count: number) => Array.from({ length: count }, (_, index) => ({ test_key: 'plank', value: 30 + index, test_date: new Date(Date.UTC(2026, 0, 1 + index * 7)).toISOString().slice(0, 10) }))

describe('/progress/tests/history', () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_SELF_TESTS; Object.assign(db, { user: 'me', rows: [], reads: [], missing: false }) })

  it('does not exist while the tests are hidden, or for an unknown test', async () => {
    await expect(render({ test: 'plank' })).rejects.toThrow('not found')
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    await expect(render({ test: 'sprint' })).rejects.toThrow('not found')
    await expect(render({})).rejects.toThrow('not found')
  })

  it('asks a signed-out visitor to sign in', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    db.user = null
    await expect(render({ test: 'plank' })).rejects.toThrow(`redirect /login?next=${encodeURIComponent('/progress/tests/history?test=plank')}`)
  })

  it("lists the athlete's own results newest first, labelled self-entered, each deletable", async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    db.rows = days(3)
    const html = await render({ test: 'plank' })
    const page = text(html)
    expect(page).toContain('ประวัติแพลงก์ศอก')
    expect(page.indexOf('32 วินาที')).toBeLessThan(page.indexOf('30 วินาที'))
    expect(page.match(/ฉันกรอกเอง/g)).toHaveLength(1)
    expect(html.match(/<button[^>]*>ลบ<\/button>/g)).toHaveLength(3)
    expect(db.reads[0]).toMatchObject({ table: 'athlete_self_tests', athlete_id: 'me', test_key: 'plank', limit: 21 })
    expect(page).not.toContain('ดูผลที่เก่ากว่านี้')
  })

  it('pages through a long history: 20 at a time, nothing cut off', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    db.rows = days(45)
    const first = await render({ test: 'plank' })
    expect(first.match(/<button[^>]*>ลบ<\/button>/g)).toHaveLength(20)
    const next = first.match(/href="\/progress\/tests\/history\?test=plank&amp;before=(\d{4}-\d{2}-\d{2})"/)
    expect(next).not.toBeNull()
    const second = await render({ test: 'plank', before: next![1] })
    expect(second.match(/<button[^>]*>ลบ<\/button>/g)).toHaveLength(20)
    expect(text(second)).toContain('กลับไปผลล่าสุด')
    const after = second.match(/before=(\d{4}-\d{2}-\d{2})"/)![1]
    const third = await render({ test: 'plank', before: after })
    expect(third.match(/<button[^>]*>ลบ<\/button>/g)).toHaveLength(5)
    expect(text(third)).not.toContain('ดูผลที่เก่ากว่านี้')
  })

  it('ignores a malformed cursor, and says when SQL96 is missing', async () => {
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    await render({ test: 'plank', before: "2026-01-01' or 1=1" })
    expect(db.reads[0]['test_date<']).toBeUndefined()
    db.missing = true
    expect(text(await render({ test: 'plank' }))).toContain('ยังเปิดใช้แบบทดสอบไม่ได้ในตอนนี้')
  })
})
