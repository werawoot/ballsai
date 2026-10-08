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
  failing: [] as string[],
}))
function fakeClient() {
  const from = (table: string) => {
    let head = false
    const builder: Record<string, unknown> = {}
    for (const name of ['eq', 'order', 'limit', 'in', 'gte']) builder[name] = () => builder
    builder.select = (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder }
    builder.maybeSingle = async () => ({ data: db.tables[table] ?? null, error: null })
    builder.single = builder.maybeSingle
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(db.failing.includes(table)
      ? { data: null, count: null, error: { code: 'XX000', message: 'boom' } }
      : head
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
// The opening tag of the first link to an address, to read the classes on it.
const anchor = (html: string, href: string) => html.match(new RegExp(`<a [^>]*href="${href.replace(/\//g, '\\/')}"[^>]*>`))?.[0] ?? ''
const primaries = (html: string) => (html.match(/class="[^"]*\b(?:pf-btn-primary|ui-btn-primary)\b[^"]*"/g) ?? []).length
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
    expect(page).toContain('ฉันกรอกเอง')
    // The audience chip follows is_public: this athlete is private, so it never says everyone can see.
    expect(page).toContain('เห็นแค่ฉัน')
    expect(page).not.toContain('ทุกคนเห็น')
    expect(page).toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
    expect(page).toContain('ผู้ปกครองยินยอม')
    expect(page).toContain('มีคำขอจากผู้ปกครองรอคุณตอบรับ 1 รายการ')
    expect(html).toContain('href="/guardian"')
    // Publishing is locked until the guardian step is done.
    expect(html).toMatch(/pf-step is-blocked[\s\S]*?เปิดโปรไฟล์สาธารณะ/)
    expect(html).toContain('href="/profile/edit"')
    // AGENTS rule 8: no rank row means a starter card that says so, never a made-up rating.
    expect(page).toContain('การ์ดเริ่มต้น')
    expect(page).toContain('ยังไม่มีคะแนนฝีมือ')
    expect(page).not.toMatch(/\d[\d,]* คะแนนฝีมือ/)
    // T50: the page shows an age, never the birth date itself.
    expect(html).not.toContain('2012-03-04')
    expect(html).not.toContain('04/03/2012')
    expect(page).toContain('athlete@example.com')
    expect(html).toContain('action="/auth/signout"')
  })

  it('shows a public athlete their rating, where it comes from, and their public page', async () => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'organizer', onboarding_persona: 'athlete' },
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
    expect(page).toContain('คะแนนฝีมือ')
    expect(page).toContain('คำนวณจากผลแข่งที่ผู้จัดบันทึกและยืนยันแล้ว')
    // The audience chip follows is_public: this athlete is public.
    expect(page).toContain('ทุกคนเห็น')
    expect(page).not.toContain('เห็นแค่ฉัน')
    expect(html).toContain('href="/players/rank-9"')
    expect(page).toContain('โค้ชยืนยันแล้ว')
    expect(page).toContain('โปรไฟล์ของคุณพร้อมแล้ว')
    expect(page).toContain('Lions')
    expect(page).toContain('ยืนยันลงแข่งแล้ว')
    // An organizer reaches their dashboard from here.
    expect(html).toContain('href="/dashboard"')
  })

  it('offers to create an athlete profile to an athlete who has none yet', async () => {
    db.tables = { profiles: { full_name: 'Newcomer', role: 'user', onboarding_persona: 'athlete' } }
    db.counts = {}
    db.private = null
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('ยังไม่มีโปรไฟล์นักกีฬา')
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

describe('/profile for an athlete who comes back to train (UX mockup v5-A)', () => {
  const daysAgo = (days: number) => new Date(Date.now() + 7 * 3600_000 - days * 86_400_000).toISOString().slice(0, 10)
  const returning = (checkins: { enrollment_id: string; session_date: string }[] = []) => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'player', onboarding_persona: 'athlete' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: true, verification_level: 'performance_verified' },
      player_ranks: { id: 'rank-9', player_name: 'Niran', position: 'MF', ovr: 71, pts: 1520 },
      athlete_progress: { xp_total: 900, current_level: 4 },
      training_enrollments: [{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: daysAgo(3), status: 'active' }],
      training_checkins: checkins,
    }
    db.counts = {}
    db.private = { birth_date: '2012-03-04', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }

  it('puts today\'s training before the profile checklist', async () => {
    returning()
    const html = await render(ProfilePage as never)
    expect(html.indexOf('tr-today')).toBeGreaterThan(-1)
    expect(html.indexOf('pf-ready-line')).toBeGreaterThan(-1)
    expect(html.indexOf('tr-today')).toBeLessThan(html.indexOf('pf-ready-line'))
  })

  it('puts today\'s training before the full checklist too', async () => {
    returning()
    ;(db.tables.athlete_profiles as { is_public: boolean }).is_public = false
    const html = await render(ProfilePage as never)
    expect(html.indexOf('tr-today')).toBeLessThan(html.indexOf('pf-next-card'))
  })

  it('shrinks the checklist of an athlete who is already public to one quiet line, not a red button', async () => {
    returning()
    const html = await render(ProfilePage as never)
    expect(html).not.toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
    expect(html).not.toContain('pf-btn-block')
    expect(text(html)).toMatch(/4 จาก 6 ขั้น/)
  })

  it('still guides an athlete who is not public yet with the full checklist', async () => {
    returning()
    ;(db.tables.athlete_profiles as { is_public: boolean }).is_public = false
    const html = await render(ProfilePage as never)
    expect(html).toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
  })

  it('links the rating to the ranking page, without counting a position here', async () => {
    returning()
    const html = await render(ProfilePage as never)
    expect(html).toContain('href="/ranking"')
    expect(text(html)).toContain('ดูอันดับของฉัน')
    expect(text(html)).toContain('1,520')
  })

  it('does not show a streak of zero weeks to someone who has just started', async () => {
    returning()
    expect(text(await render(ProfilePage as never))).not.toContain('ต่อเนื่อง 0 สัปดาห์')
  })
})

describe('/profile is "ของฉัน": it opens on the work of each role (UX report 9)', () => {
  const as = (persona: string | null, role = 'user') => {
    db.tables = { profiles: { full_name: 'Somsak', role, onboarding_persona: persona } }
    db.counts = {}
    db.private = null
    db.failing = []
  }

  it('shows a coach their team and one primary button, never the organizer dashboard', async () => {
    as('coach_organizer')
    db.tables.teams = [{ id: 't1', name: 'Lions U13', status: 'draft' }]
    db.counts = { team_members: 2 }
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(page).toContain('ทีมของฉัน')
    expect(page).toContain('ส่งสมัครทีม')
    expect(page).toContain('Lions U13 · ตอบรับ 2 · รอตอบ 2')
    expect(html).toContain('href="/team-members"')
    expect(html).not.toMatch(/href="\/dashboard/)
    // Not an athlete's page: no card builder prompt, no level, no athlete checklist.
    expect(page).not.toContain('ยังไม่มีโปรไฟล์นักกีฬา')
    expect(page).not.toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
    expect(primaries(html)).toBe(1)
  })

  it('sends a coach with no team to register one', async () => {
    as('coach_organizer')
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('สมัครทีมเข้ารายการ')
    expect(anchor(html, '/tournaments')).toContain('pf-btn-primary')
  })

  it('shows a guardian their children', async () => {
    as('guardian')
    db.counts = { guardian_links: 1 }
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('ลูกของฉัน')
    expect(text(html)).toContain('ดูความก้าวหน้าของลูก')
    expect(anchor(html, '/guardian')).toContain('pf-btn-primary')
    expect(text(html)).not.toContain('ยังไม่มีโปรไฟล์นักกีฬา')
    expect(primaries(html)).toBe(1)
  })

  it('shows an organizer the teams waiting for them', async () => {
    as('coach_organizer', 'organizer')
    db.counts = { tournaments: 2, teams: 3 }
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('รายการของฉัน')
    expect(text(html)).toContain('ตรวจทีมที่รอ (3)')
    expect(anchor(html, '/dashboard')).toContain('pf-btn-primary')
    expect(primaries(html)).toBe(1)
  })

  it('shows a venue owner the booking requests waiting for an answer', async () => {
    as('venue_owner')
    db.counts = { venue_profiles: 1, venue_booking_requests: 2 }
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('สนามของฉัน')
    expect(text(html)).toContain('ตอบคำขอจอง (2)')
    expect(anchor(html, '/venue')).toContain('pf-btn-primary')
    expect(text(html)).not.toContain('ยังไม่มีโปรไฟล์นักกีฬา')
  })

  it('keeps the card of a coach who also plays one tap away', async () => {
    as('coach_organizer')
    db.counts = { athlete_profiles: 1 }
    const html = await render(ProfilePage as never)
    expect(html).toContain('href="/card"')
    expect(text(html)).toContain('การ์ดนักกีฬาของฉัน')
  })

  it('says so when the work could not be read, instead of offering to create what may already exist', async () => {
    as('coach_organizer', 'organizer')
    db.failing = ['tournaments']
    const html = await render(ProfilePage as never)
    expect(html).toContain('role="alert"')
    expect(text(html)).toContain('โหลดงานของคุณไม่สำเร็จ')
    expect(text(html)).not.toContain('สร้างรายการแข่ง')
  })

  it('names the role under the name', async () => {
    as('guardian')
    expect(text(await render(ProfilePage as never))).toContain('ในฐานะ ผู้ปกครอง')
  })

  it('speaks English without Thai on a coach home', async () => {
    as('coach_organizer')
    const html = await render(ProfilePage as never, 'en')
    const beforeDeletion = text(withoutSwitch(html.slice(0, html.indexOf('ลบข้อมูลของฉัน'))))
    expect(beforeDeletion).toContain('Register a team')
    expect(beforeDeletion).not.toMatch(/[ก-ฺเ-๛]/)
  })
})

describe('/profile for an athlete: training first, then the card (owner, report 9)', () => {
  const athlete = (enrollments: unknown[], isPublic = false) => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'user', onboarding_persona: 'athlete' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: isPublic },
      training_enrollments: enrollments,
    }
    db.counts = {}
    db.failing = []
    db.private = { birth_date: '2013-06-01', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }

  it('asks an athlete without a programme to choose one, and names the one for their age', async () => {
    athlete([])
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('เลือกโปรแกรมซ้อม')
    expect(text(html)).toMatch(/เหมาะกับอายุ \d+ ปี: /)
    expect(anchor(html, '/training')).toContain('ui-btn-primary')
    // Before the card and before the checklist.
    expect(html.indexOf('tr-today')).toBeLessThan(html.indexOf('pf-next-card'))
    expect(html.indexOf('tr-today')).toBeLessThan(html.indexOf('id="pf-card"'))
  })

  it('has one primary button: the checklist step steps back while training holds it', async () => {
    athlete([])
    expect(primaries(await render(ProfilePage as never))).toBe(1)
  })

  it('gives the primary back to the checklist when there is nothing to train today', async () => {
    athlete([{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [], start_date: '2026-01-05', status: 'active' }])
    const html = await render(ProfilePage as never)
    expect(primaries(html)).toBe(1)
    expect(html).toMatch(/pf-btn pf-btn-block pf-btn-primary/)
  })

  it('keeps editing as a quiet button in the header, not a second red one', async () => {
    athlete([])
    const html = await render(ProfilePage as never)
    expect(anchor(html, '/profile/edit')).toContain('pf-btn-ghost')
    expect(anchor(html, '/profile/edit')).not.toContain('pf-btn-primary')
  })

  it('keeps the card as a secondary shortcut', async () => {
    athlete([])
    const html = await render(ProfilePage as never)
    expect(anchor(html, '/card')).toContain('pf-btn-line')
  })

  it('hides level and points until the first point', async () => {
    athlete([])
    expect(await render(ProfilePage as never)).not.toContain('class="pf-level"')
    ;(db.tables as Record<string, unknown>).athlete_progress = { xp_total: 40, current_level: 1 }
    const html = await render(ProfilePage as never)
    expect(html).toContain('class="pf-level"')
    expect(text(html)).toContain('40 แต้ม')
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

// Chrome test, 8 Oct 2026: a birth date in this year made /profile say "อายุ 0 ปี".
describe('/profile with a birth date that cannot be right', () => {
  it('shows no age rather than 0', async () => {
    setMinor()
    db.private = { birth_date: `${new Date().getFullYear()}-01-01`, guardian_consent_at: null }
    const page = text(await render(ProfilePage as never))
    expect(page).not.toMatch(/(^|\D)0 ปี/)
  })
})
