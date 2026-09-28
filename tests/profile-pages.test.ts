import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback, type Locale } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database boundary for /profile and /profile/edit: one row or list per table, the
// athlete's private fields through my_athlete_private, and head counts.
const db = vi.hoisted(() => ({
  locale: 'th' as 'th' | 'en',
  tables: {} as Record<string, unknown>,
  counts: {} as Record<string, number>,
  private: null as null | { birth_date: string | null; guardian_consent_at: string | null },
}))
function fakeClient() {
  const from = (table: string) => {
    let head = false
    const builder: Record<string, unknown> = {}
    for (const name of ['eq', 'order', 'limit', 'in']) builder[name] = () => builder
    builder.select = (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder }
    builder.maybeSingle = async () => ({ data: db.tables[table] ?? null, error: null })
    builder.single = builder.maybeSingle
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(head
      ? { data: null, count: db.counts[table] ?? 0, error: null }
      : { data: db.tables[table] ?? [], error: null }).then(resolve)
    return builder
  }
  return {
    from,
    rpc: async () => ({ data: db.private ? [db.private] : [], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'me', email: 'athlete@example.com' } } }) },
  }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('@/lib/supabase', () => ({ createClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => '/profile',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@vercel/analytics', () => ({ track: () => {} }))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => db.locale,
  getTranslations: async (namespace?: string) => createTranslator({ locale: db.locale, messages: messagesFor(db.locale), namespace } as never),
}))

import ProfilePage from '@/app/profile/page'
import EditProfilePage from '@/app/profile/edit/page'

const render = async (page: () => Promise<ReactElement>, locale: Locale = 'th') => {
  db.locale = locale
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: messagesFor(locale), timeZone: 'Asia/Bangkok' } as never, await page()))
}
// The language switch names the other language on purpose ("ไทย" on an English page).
const withoutSwitch = (html: string) => html.replace(/<button[^>]*class="bds-lang-switch"[\s\S]*?<\/button>/g, '')
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&#x27;/g, "'").replace(/\s+/g, ' ')

const minor = {
  display_name: 'Somchai Jaidee', position: 'MF', province: 'Chiang Mai', current_team: 'Chiang Mai FC U15',
  profile_image_url: null, is_public: false, verification_level: 'self', height_cm: 158, weight_kg: 47, bio: null,
}
const setMinor = () => {
  db.tables = { profiles: { full_name: 'Somchai', role: 'player', onboarding_persona: 'athlete' }, athlete_profiles: minor, athlete_progress: { xp_total: 240, current_level: 2 } }
  db.counts = { guardian_links: 1 }
  db.private = { birth_date: '2012-03-04', guardian_consent_at: null }
}

describe('/profile', () => {
  it('leads with the athlete, and shows a minor what stands between them and a public profile', async () => {
    setMinor()
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(page).toContain('Somchai Jaidee')
    expect(page).toContain('Chiang Mai FC U15 · Chiang Mai')
    expect(page).toContain('14 ปี')
    expect(page).toContain('ข้อมูลที่กรอกเอง')
    expect(page).toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
    expect(page).toContain('ผู้ปกครองยินยอม')
    expect(page).toContain('มีคำขอจากผู้ปกครองรอคุณตอบรับ 1 รายการ')
    expect(html).toContain('href="/guardian"')
    // Publishing is locked until the guardian step is done.
    expect(html).toMatch(/pf-step is-blocked[\s\S]*?เปิดโปรไฟล์สาธารณะ/)
    expect(html).toContain('href="/profile/edit"')
    // AGENTS rule 8: no rank row means a STARTER card that says so, never a made-up rating.
    expect(page).toContain('STARTER CARD')
    expect(page).not.toMatch(/\d[\d,]* Power Rating/)
    // T50: the page shows an age, never the birth date itself.
    expect(html).not.toContain('2012-03-04')
    expect(html).not.toContain('04/03/2012')
    expect(page).toContain('athlete@example.com')
    expect(html).toContain('action="/auth/signout"')
  })

  it('shows a public athlete their rating, where it comes from, and their public page', async () => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'organizer', onboarding_persona: 'coach_organizer' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: true, profile_image_url: 'https://cdn.example/n.jpg', verification_level: 'coach_verified' },
      player_ranks: { id: 'rank-9', player_name: 'Niran', position: 'FW', ovr: 71, pts: 1520 },
      athlete_progress: { xp_total: 900, current_level: 4 },
      team_members: [{ status: 'accepted', teams: { id: 't1', name: 'Lions', status: 'confirmed', tournaments: [{ name: 'City Cup', location: 'Bangkok' }] } }],
    }
    db.counts = { athlete_highlights: 2 }
    db.private = { birth_date: '1999-05-05', guardian_consent_at: null }
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(page).toContain('1,520')
    expect(page).toContain('Power Rating')
    expect(page).toContain('คำนวณจากผลแข่งที่ผู้จัดบันทึกและยืนยันแล้ว')
    expect(html).toContain('href="/players/rank-9"')
    expect(page).toContain('โค้ชยืนยันแล้ว')
    expect(page).toContain('โปรไฟล์ของคุณพร้อมแล้ว')
    expect(page).toContain('Lions')
    expect(page).toContain('ยืนยันลงแข่งแล้ว')
    // An organizer reaches their dashboard from here.
    expect(html).toContain('href="/dashboard"')
  })

  it('offers to create an athlete profile to someone without one', async () => {
    db.tables = { profiles: { full_name: 'Venue Owner', role: 'player', onboarding_persona: 'venue_owner' } }
    db.counts = {}
    db.private = null
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('ยังไม่มีโปรไฟล์นักกีฬา')
    expect(html).toContain('href="/venue"')
    expect(text(html)).not.toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
  })

  it('speaks English without leaking Thai, apart from the data-deletion notice still awaiting translation', async () => {
    setMinor()
    const html = await render(ProfilePage as never, 'en')
    const beforeDeletion = text(withoutSwitch(html.slice(0, html.indexOf('ลบข้อมูลของฉัน'))))
    expect(beforeDeletion).toContain('Before your profile goes public')
    expect(beforeDeletion).toContain('14 yrs')
    expect(beforeDeletion).not.toMatch(/[ก-ฺเ-๛]/)
  })
})

describe('/profile/edit', () => {
  it('splits editing into sections, with the saved birth date filled in', async () => {
    setMinor()
    const html = await render(EditProfilePage as never)
    for (const id of ['details', 'privacy', 'highlights', 'achievements']) {
      expect(html).toContain(`id="${id}"`)
      expect(html).toContain(`href="#${id}"`)
    }
    expect(html).toContain('value="2012-03-04"')
    expect(html).toContain('href="/profile"')
    expect(text(html)).toContain('ข้อมูลเป็นปัจจุบัน')
    expect(html).toMatch(/aria-pressed="true"[^>]*><b>MF<\/b>/)
  })

  // AGENTS rule 9: a minor without recorded consent cannot switch the profile public.
  it('locks the public switch for a minor without guardian consent and says why', async () => {
    setMinor()
    const html = await render(EditProfilePage as never)
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"[^>]*disabled=""/)
    expect(text(html)).toContain('ไปหน้าผู้ปกครอง')
  })

  it('lets an adult switch it', async () => {
    setMinor()
    db.private = { birth_date: '1990-01-01', guardian_consent_at: null }
    const html = await render(EditProfilePage as never)
    expect(html).toMatch(/role="switch"[^>]*aria-checked="false"/)
    expect(html).not.toMatch(/role="switch"[^>]*disabled=""/)
  })

  it('speaks English without leaking Thai', async () => {
    setMinor()
    const html = await render(EditProfilePage as never, 'en')
    expect(text(html)).toContain('Athlete details')
    expect(text(withoutSwitch(html))).not.toMatch(/[ก-ฺเ-๛]/)
  })
})
