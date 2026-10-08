import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

const db = vi.hoisted(() => ({ persona: 'guardian' as string | null }))
function fakeClient() {
  const from = (table: string) => {
    const builder: Record<string, unknown> = {}
    for (const name of ['eq', 'order', 'limit', 'select']) builder[name] = () => builder
    builder.maybeSingle = async () => ({ data: table === 'profiles' ? { onboarding_persona: db.persona } : null, error: null })
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: 'me', email: 'parent@example.com' } } }) } }
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
