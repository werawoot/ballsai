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
  // my_team_memberships rows (sql/82); null: the function is missing, the old read is used.
  memberships: null as null | Record<string, unknown>[],
  failing: [] as string[],
  // Before SQL78 teams has no kind column: a select naming it fails the way PostgREST does.
  noKindColumn: false,
}))
function fakeClient() {
  const from = (table: string) => {
    let head = false
    let missingColumn = false
    const builder: Record<string, unknown> = {}
    for (const name of ['eq', 'order', 'limit', 'in', 'gte', 'is']) builder[name] = () => builder
    builder.select = (columns: string, options?: { head?: boolean }) => {
      head = Boolean(options?.head)
      missingColumn = db.noKindColumn && table === 'teams' && /(^|[ ,])kind([ ,]|$)/.test(columns)
      return builder
    }
    builder.maybeSingle = async () => ({ data: db.tables[table] ?? null, error: null })
    builder.single = builder.maybeSingle
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(missingColumn
      ? { data: null, count: null, error: { code: '42703', message: 'column teams.kind does not exist' } }
      : db.failing.includes(table)
      ? { data: null, count: null, error: { code: 'XX000', message: 'boom' } }
      : head
        ? { data: null, count: db.counts[table] ?? 0, error: null }
        : { data: db.tables[table] ?? [], error: null }).then(resolve)
    return builder
  }
  return {
    from,
    // my_profile_home (sql/91) answers as missing here, so these pages read through the
    // separate reads it replaces; tests/profile-home.test.ts covers the one-call path.
    rpc: async (fn: string) => fn === 'my_profile_home'
      ? { data: null, error: { code: 'PGRST202' } }
      : fn === 'my_team_memberships'
      ? (db.memberships ? { data: db.memberships, error: null } : { data: null, error: { code: 'PGRST202' } })
      : { data: db.private ? [db.private] : [], error: null },
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
// The open tournaments the athlete home shows: the same cached read as the home page.
const open = vi.hoisted(() => ({ tournaments: [] as Record<string, unknown>[] }))
vi.mock('@/lib/public-data', () => ({ getPublicOpenTournaments: async () => open.tournaments }))
const messagesFor = (locale: Locale) => locale === 'th' ? th : withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => db.locale,
  getTranslations: async (namespace?: string) => createTranslator({ locale: db.locale, messages: messagesFor(db.locale), namespace } as never),
}))

import ProfilePage from '@/app/profile/page'
import EditProfilePage from '@/app/profile/edit/page'
import MePage from '@/app/me/page'

const render = async (page: () => Promise<ReactElement>, locale: Locale = 'th') => {
  db.locale = locale
  return renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale, messages: messagesFor(locale), timeZone: 'Asia/Bangkok' } as never, await page()))
}
// The language switch names the other language on purpose ("ไทย" on an English page).
const withoutSwitch = (html: string) => html.replace(/<button[^>]*class="bds-lang-switch"[\s\S]*?<\/button>/g, '')
// The opening tag of the first link to an address, to read the classes on it.
const anchor = (html: string, href: string) => html.match(new RegExp(`<a [^>]*href="${href.replace(/\//g, '\\/')}"[^>]*>`))?.[0] ?? ''
// Today's first open mission is the athlete home's primary step (third reference, owner 3 Nov 2026).
const primaries = (html: string) => (html.match(/class="[^"]*\b(?:pf-btn-primary|ui-btn-primary|pf-mission-mark is-primary)\b[^"]*"/g) ?? []).length
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
    expect(page).toContain('14 ปี · Chiang Mai FC U15 · Chiang Mai')
    expect(page).toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
    expect(page).toContain('ผู้ปกครองยินยอม')
    expect(page).toContain('มีคำขอจากผู้ปกครองรอคุณตอบรับ 1 รายการ')
    expect(html).toContain('href="/guardian"')
    // Publishing is locked until the guardian step is done.
    expect(html).toMatch(/pf-step is-blocked[\s\S]*?เปิดโปรไฟล์สาธารณะ/)
    // AGENTS rule 8: no rank row means a starter card that says so, never a made-up rating.
    expect(page).toContain('การ์ดเริ่มต้น')
    expect(page).toContain('คะแนนมาจากผลแข่งที่ผู้จัดยืนยันเท่านั้น')
    expect(page).not.toMatch(/\d[\d,]* คะแนนฝีมือ/)
    // T50: the page shows an age, never the birth date itself.
    expect(html).not.toContain('2012-03-04')
    expect(html).not.toContain('04/03/2012')
    // The account and sign-out live on /me, the profile tab (owner, 2 Nov 2026).
    expect(page).not.toContain('athlete@example.com')
    expect(html).toContain('href="/me"')
  })

  it('shows an athlete with no team how to get into one on /me, without a primary button', async () => {
    const html = await render(MePage as never)
    // AGENTS.md product rule (report 10, mockup v10-3): the team is the step that needs a coach.
    // Since the second reference (owner, 2 Nov 2026) it lives on /me, the profile tab.
    expect(text(html)).toContain('อยู่ทีมไหน?')
    expect(html).toContain('pf-team-ask')
    expect(primaries(html)).toBe(0)
  })

  it('names the team an athlete joined, which RLS hides from the old read (sql/82)', async () => {
    db.tables.team_members = [{ status: 'accepted', teams: null }]
    db.memberships = [{ member_id: 'm1', team_id: 't1', status: 'accepted', invited_at: null, created_at: '2026-10-18T01:00:00Z', team_name: 'QA ทดสอบ 18ตค', team_status: 'draft', team_kind: 'club', tournament_name: null, tournament_location: null }]
    const page = text(await render(MePage as never))
    db.memberships = null
    expect(page).toContain('QA ทดสอบ 18ตค')
    expect(page).toContain('ดูทีมของฉัน')
    // A coach's own team is in no tournament yet: it says so, not a bare "รายการแข่ง".
    expect(page).toContain('QA ทดสอบ 18ตค ยังไม่ได้ลงรายการแข่ง')
  })

  it('does not ask an athlete who is already in a team', async () => {
    db.tables.team_members = [{ status: 'accepted', teams: { id: 't1', name: 'Lions', status: 'confirmed', tournaments: [] } }]
    const html = await render(MePage as never)
    expect(html).not.toContain('pf-team-ask')
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
    expect(page).toContain('คะแนนฝีมือ 1,520')
    // The card's own OVR from the rank row, and a dash for each skill nobody assessed.
    expect(page).toMatch(/71 FW/)
    // A finished checklist leaves the home; the team is on /me.
    expect(html).not.toContain('pf-readiness')
    const me = text(await render(MePage as never))
    expect(me).toContain('Lions')
    expect(me).toContain('ยืนยันลงแข่งแล้ว')
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
    expect(html.indexOf('pf-missions')).toBeGreaterThan(-1)
    expect(html.indexOf('pf-ready-line')).toBeGreaterThan(-1)
    expect(html.indexOf('pf-missions')).toBeLessThan(html.indexOf('pf-ready-line'))
  })

  it('puts today\'s training before the full checklist too', async () => {
    returning()
    ;(db.tables.athlete_profiles as { is_public: boolean }).is_public = false
    const html = await render(ProfilePage as never)
    expect(html.indexOf('pf-missions')).toBeGreaterThan(-1)
    expect(html.indexOf('pf-missions')).toBeLessThan(html.indexOf('pf-next-card'))
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

  it('shows the rating on the card, which opens /card, without counting a position here', async () => {
    returning()
    const html = await render(ProfilePage as never)
    expect(anchor(html, '/card')).toContain('pf-bigcard')
    expect(text(html)).toContain('คะแนนฝีมือ 1,520')
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
    db.noKindColumn = false
  }

  it('shows a coach their team and one primary button, never the organizer dashboard', async () => {
    as('coach_organizer')
    db.tables.teams = [{ id: 't1', name: 'Lions U13', status: 'draft' }]
    // Member rows are counted per team (lib/role-home-data coachFacts, report 11).
    db.tables.team_members = [...Array(2)].map(() => ({ team_id: 't1', status: 'accepted' })).concat([...Array(2)].map(() => ({ team_id: 't1', status: 'pending' })))
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(page).toContain('ทีมของฉัน')
    // Report 11 (15 Oct 2026): the card is not read as creating a team. Production test, same
    // day: its button uses the words of the button it leads to, "ส่งสมัครรายการ".
    expect(page).toContain('พร้อมส่งสมัครรายการ')
    expect(html).toMatch(/>ส่งสมัครรายการ</)
    expect(page).not.toContain('ส่งสมัครทีมเข้ารายการ')
    expect(page).not.toContain('ส่งรายชื่อให้ผู้จัด')
    expect(page).toContain('Lions U13 · ตอบรับ 2 · รอตอบ 2')
    expect(html).toContain('href="/team-members"')
    expect(html).not.toMatch(/href="\/dashboard/)
    // Not an athlete's page: no card builder prompt, no level, no athlete checklist.
    expect(page).not.toContain('ยังไม่มีโปรไฟล์นักกีฬา')
    expect(page).not.toContain('ก่อนเปิดโปรไฟล์สาธารณะ')
    expect(primaries(html)).toBe(1)
  })

  it('gives a coach with no team something to use at once, and registering a team last (before SQL78)', async () => {
    as('coach_organizer')
    db.noKindColumn = true
    const html = await render(ProfilePage as never)
    // AGENTS.md product rule (report 10): the draft board needs no team and no invitation.
    expect(anchor(html, '/match-plan')).toContain('pf-btn-primary')
    expect(anchor(html, '/training/drills')).toContain('rh-tool')
    expect(text(html)).toContain('สมัครทีมเข้ารายการ')
    expect(html.indexOf('/match-plan')).toBeLessThan(html.indexOf('rh-next'))
  })

  it('lets a coach with no team create their own team at once, with no tournament in the way (SQL78)', async () => {
    as('coach_organizer')
    const html = await render(ProfilePage as never)
    expect(anchor(html, '/team-members#create')).toContain('pf-btn-primary')
    expect(primaries(html)).toBe(1)
    expect(anchor(html, '/match-plan')).toContain('rh-tool')
    expect(anchor(html, '/training/drills')).toContain('rh-tool')
    expect(text(html)).not.toContain('สมัครทีมเข้ารายการ')
  })

  it('gives a guardian with no linked child something to use at once, and linking last', async () => {
    as('guardian')
    db.counts = { guardian_links: 0 }
    const html = await render(ProfilePage as never)
    expect(anchor(html, '/training')).toContain('pf-btn-primary')
    expect(anchor(html, '/hall-of-fame')).toContain('rh-tool')
    expect(text(html)).toContain('เชื่อมบัญชีลูก')
    expect(html.indexOf('href="/training"')).toBeLessThan(html.indexOf('rh-next'))
    expect(primaries(html)).toBe(1)
    expect(html).not.toContain('rh-stats')
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
    // The page reads the athlete row itself now (sql/91 or its fallback), not a head count.
    db.tables = { ...db.tables, athlete_profiles: minor }
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
    expect(beforeDeletion).toContain('Create my team')
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
    db.noKindColumn = false
    db.private = { birth_date: '2013-06-01', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }

  it('asks an athlete without a programme to choose one, and names the one for their age', async () => {
    athlete([])
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('เลือกโปรแกรมซ้อม')
    expect(text(html)).toMatch(/เหมาะกับอายุ \d+ ปี: /)
    expect(anchor(html, '/training')).toContain('ui-btn-primary')
    // After the card (DOENSAI dashboard design, owner 2 Nov 2026), before the checklist.
    expect(html.indexOf('tr-today')).toBeLessThan(html.indexOf('pf-next-card'))
    expect(html.indexOf('tr-today')).toBeGreaterThan(html.indexOf('id="pf-card"'))
  })

  it('has one primary button: the checklist step steps back while training holds it', async () => {
    athlete([])
    expect(primaries(await render(ProfilePage as never))).toBe(1)
  })

  it('gives the primary back to the checklist on a rest day', async () => {
    const todayBkk = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
    const weekday = (new Date(`${todayBkk}T00:00:00Z`).getUTCDay() + 6) % 7
    athlete([{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [(weekday + 1) % 7], start_date: todayBkk, status: 'active' }])
    const html = await render(ProfilePage as never)
    expect(primaries(html)).toBe(1)
    expect(html).toMatch(/pf-btn pf-btn-block pf-btn-primary/)
  })

  it('keeps editing off the home: it is a quiet button on /me', async () => {
    athlete([])
    expect(await render(ProfilePage as never)).not.toContain('pf-btn-ghost')
    const me = await render(MePage as never)
    expect(anchor(me, '/profile/edit')).toContain('pf-btn-ghost')
    expect(anchor(me, '/profile/edit')).not.toContain('pf-btn-primary')
  })

  it('keeps the card a link, never a primary button', async () => {
    athlete([])
    const html = await render(ProfilePage as never)
    expect(anchor(html, '/card')).toContain('pf-bigcard')
    expect(anchor(html, '/card')).not.toContain('primary')
  })

  // ADR-015 (owner, 8 Nov 2026): the home shows the training level, from effort points,
  // not the match level, and only after the first recorded session.
  it('hides the training level until the first session, then counts it from effort points', async () => {
    athlete([])
    ;(db.tables as Record<string, unknown>).athlete_progress = { xp_total: 40, current_level: 1 }
    expect(await render(ProfilePage as never)).not.toContain('class="pf-lv"')
    db.counts.training_checkins = 3
    const html = await render(ProfilePage as never)
    expect(html).toContain('class="pf-lv"')
    expect(text(html)).toContain('ระดับฝึกซ้อม 1 150 / 500 แต้มขยัน')
    delete db.counts.training_checkins
  })

  // Self-tests (owner, 13 Nov 2026), behind NEXT_PUBLIC_SELF_TESTS: a reminder when one is due.
  it('reminds the athlete when a self-test is due, only while the tests are switched on', async () => {
    athlete([])
    expect(await render(ProfilePage as never)).not.toContain('pf-test-due')
    process.env.NEXT_PUBLIC_SELF_TESTS = 'true'
    try {
      // Never tested, 13 years old: all three, as a first time.
      let html = await render(ProfilePage as never)
      expect(anchor(html, '/progress/tests')).toContain('pf-test-due')
      expect(text(html)).toContain('ลองวัดพัฒนาการครั้งแรก')
      expect(text(html)).toContain('แบบทดสอบตัวเอง 3 อย่างถึงเวลาแล้ว')
      expect(anchor(html, '/progress/tests')).not.toContain('primary')
      // Every test taken today: nothing due, no card.
      const todayBkk = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
      ;(db.tables as Record<string, unknown>).athlete_self_tests = ['juggling', 'plank', 'long_jump'].map(key => ({ test_key: key, value: 20, test_date: todayBkk }))
      html = await render(ProfilePage as never)
      expect(html).not.toContain('pf-test-due')
    } finally {
      delete process.env.NEXT_PUBLIC_SELF_TESTS
      delete (db.tables as Record<string, unknown>).athlete_self_tests
    }
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

describe('/profile athlete home in the DOENSAI dashboard design (owner, 2 Nov 2026)', () => {
  const bangkokDay = (days = 0) => new Date(Date.now() + 7 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
  const athleteHome = (tables: Record<string, unknown> = {}) => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'player', onboarding_persona: 'athlete' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: true, verification_level: 'performance_verified' },
      player_ranks: { id: 'rank-9', player_name: 'Niran', position: 'MF', ovr: 71, pts: 1520 },
      athlete_progress: { xp_total: 900, current_level: 4 },
      training_enrollments: [{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: bangkokDay(-3), status: 'active' }],
      training_checkins: [],
      ...tables,
    }
    db.counts = {}
    db.private = { birth_date: '2012-03-04', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }
  const coachRow = { speed: 70, stamina: 64, strength: null, technique: 81, vision: 58, source_level: 'coach_verified', created_at: '2026-10-20T03:00:00Z' }

  it('opens on the greeting with the bell and the way to /me, then the card, today\'s programme and the week', async () => {
    athleteHome()
    db.counts = { notifications: 3 }
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(page).toContain('สวัสดี Niran')
    expect(html).toContain('href="/notifications"')
    expect(html).toMatch(/aria-label="แจ้งเตือน · ยังไม่อ่าน 3 รายการ"/)
    expect(html).toContain('href="/me"')
    expect(page).toContain('พร้อมพัฒนาตัวเองวันนี้ไหม?')
    expect(page).toContain('⚽ ฟุตบอล')
    expect(page).toContain('ภาพรวมของฉัน')
    expect(page).toContain('ภารกิจวันนี้')
    expect(page).toContain('ตารางฝึกซ้อมถัดไป')
    expect(html.indexOf('id="pf-card"')).toBeLessThan(html.indexOf('id="pf-missions"'))
    expect(html.indexOf('id="pf-missions"')).toBeLessThan(html.indexOf('id="pf-next"'))
    expect(html.indexOf('id="pf-next"')).toBeLessThan(html.indexOf('id="pf-week"'))
    expect(page).not.toMatch(/\+\d+ ?XP/)
    expect(primaries(html)).toBe(1)
  })

  it('shows the week from the athlete\'s own check-ins, minutes from the programme, no points', async () => {
    athleteHome({ training_checkins: [{ enrollment_id: 'e1', session_date: bangkokDay(0) }] })
    const page = text(await render(ProfilePage as never))
    expect(page).toContain('ความก้าวหน้าสัปดาห์นี้')
    expect(page).toMatch(/1\/\d+ ฝึกซ้อม \d+ นาที \+50 แต้มขยัน/)
    expect(page).toContain('นับจากที่คุณบันทึกเอง')
    expect(page).toContain('แต้มจากแมตช์มาจากผลแข่งที่ผู้จัดยืนยันเท่านั้น')
  })

  it('shows the change of the last verified match, and nothing once a void reset it', async () => {
    athleteHome({ player_ratings: { matches_played: 3, last_rating_change: 15 } })
    expect(text(await render(ProfilePage as never))).toContain('↑ +15')
    athleteHome({ player_ratings: { matches_played: 3, last_rating_change: 0 } })
    expect(text(await render(ProfilePage as never))).not.toMatch(/[↑↓]/)
  })

  it('shows the XP of verified matches this week, and 0 without one', async () => {
    athleteHome({ athlete_xp_events: [{ xp_amount: 50 }, { xp_amount: 20 }] })
    expect(text(await render(ProfilePage as never))).toMatch(/\+70 แต้มจากแมตช์/)
    athleteHome()
    expect(text(await render(ProfilePage as never))).toMatch(/ 0 แต้มจากแมตช์/)
  })

  it('draws the skills a coach assessed on /me, with who and when', async () => {
    athleteHome({ athlete_skill_assessments: coachRow })
    const html = await render(MePage as never)
    expect(html).toContain('class="pf-radar-shape"')
    expect(html).toMatch(/aria-label="กราฟทักษะ: ความเร็ว 70, ความอึด 64, เทคนิค 81, การอ่านเกม 58"/)
    expect(text(html)).toContain('โค้ชประเมิน ·')
  })

  it('draws no shape from a self-assessment, and says how a coach assessment arrives', async () => {
    athleteHome({ athlete_skill_assessments: { ...coachRow, source_level: 'self' } })
    const html = await render(MePage as never)
    expect(html).not.toContain('pf-radar-shape')
    expect(text(html)).toContain('ยังไม่มีการประเมิน')
  })

  it('speaks English without Thai across the new parts', async () => {
    athleteHome({ athlete_skill_assessments: coachRow, player_ratings: { matches_played: 3, last_rating_change: -8 } })
    const html = await render(ProfilePage as never, 'en')
    const beforeDeletion = text(withoutSwitch(html.slice(0, html.indexOf('ลบข้อมูลของฉัน'))))
    expect(beforeDeletion).toContain("Today's missions")
    expect(beforeDeletion).toContain('↓ −8')
    expect(beforeDeletion).toContain('XP from matches')
    expect(beforeDeletion).not.toMatch(/[ก-ฺเ-๛]/)
    const me = await render(MePage as never, 'en')
    const meBefore = text(withoutSwitch(me.slice(0, me.indexOf('ลบข้อมูลของฉัน'))))
    expect(meBefore).toContain('Coach assessed ·')
    expect(meBefore).not.toMatch(/[ก-ฺเ-๛]/)
  })
})

describe('/profile home module of the third reference (owner, 3 Nov 2026)', () => {
  const bangkok = (days = 0) => new Date(Date.now() + 7 * 3600_000 + days * 86_400_000).toISOString().slice(0, 10)
  const setup = (checkins: { enrollment_id: string; session_date: string }[] = []) => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'player', onboarding_persona: 'athlete' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: true, verification_level: 'self' },
      training_enrollments: [{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: bangkok(-3), status: 'active' }],
      training_checkins: checkins,
    }
    db.counts = {}
    db.failing = []
    db.private = { birth_date: '2012-03-04', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }

  it('makes today\'s programme a mission worth effort points, with one green start', async () => {
    setup()
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(page).toContain('รับได้ +50 แต้มขยัน')
    expect(html).toContain('href="/training/u10-foundation-01/session"')
    expect((html.match(/pf-mission-mark is-primary/g) ?? []).length).toBe(1)
    expect(primaries(html)).toBe(1)
    // Effort points are never XP and say so.
    expect(page).toContain('ไม่ใช่แต้มจากแมตช์ ใช้ขึ้นระดับฝึกซ้อมเท่านั้น ไม่มีผลต่อการ์ด อันดับ หรือคะแนนฝีมือ')
    expect(page).not.toMatch(/\+\d+ ?XP/)
  })

  it('ticks a mission once checked in, counts the days in a row and the minutes, and moves the next session on', async () => {
    setup([{ enrollment_id: 'e1', session_date: bangkok(-1) }, { enrollment_id: 'e1', session_date: bangkok(0) }])
    const html = await render(ProfilePage as never)
    const page = text(html)
    expect(html).toContain('pf-mission-mark is-done')
    expect(page).toMatch(/ซ้อมตามแผนติดกัน 2 วันซ้อม/)
    expect(page).toMatch(/นาทีซ้อม \d+ นาที/)
    expect(page).toContain('ได้แล้ว +50 แต้มขยัน')
    expect(page).toMatch(/ตารางฝึกซ้อมถัดไป ดูทั้งหมด .* · \d+ นาที/)
    expect(page).not.toMatch(/ตารางฝึกซ้อมถัดไป ดูทั้งหมด [^ ]+ วันนี้/)
  })

  it('says how many effort points today has given, of how many', async () => {
    setup()
    db.tables.training_enrollments = [...(db.tables.training_enrollments as Record<string, unknown>[]), { id: 'e2', program_id: 'u10-ball-mastery-01', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: bangkok(-3), status: 'active' }]
    db.tables.training_checkins = [{ enrollment_id: 'e1', session_date: bangkok(0) }]
    expect(text(await render(ProfilePage as never))).toContain('ได้แล้ว +50 จาก +100 แต้มขยัน')
  })

  it('shows one real open tournament with a way to enter', async () => {
    setup()
    open.tournaments = [{ id: 't-9', name: 'Lopburi Youth Cup', location: 'Lopburi', start_date: bangkok(10), end_date: null, status: 'open' }]
    const html = await render(ProfilePage as never)
    open.tournaments = []
    expect(text(html)).toContain('การแข่งขันและโอกาส')
    expect(html).toContain('href="/tournaments/t-9"')
  })

  it('asks for a new programme once the programme is finished, as the primary', async () => {
    setup()
    db.tables.training_enrollments = [{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2025-01-06', status: 'active' }]
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('โปรแกรมของคุณจบแล้ว')
    expect(html).not.toContain('id="pf-missions"')
    expect(anchor(html, '/training\\?tab=programs')).toContain('ui-btn-primary')
    expect(primaries(html)).toBe(1)
  })

  it('treats an enrolment in a removed programme as no programme', async () => {
    setup()
    db.tables.training_enrollments = [{ id: 'e1', program_id: 'gone-programme', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: bangkok(-3), status: 'active' }]
    const html = await render(ProfilePage as never)
    expect(html).not.toContain('id="pf-missions"')
    expect(html).not.toContain('id="pf-week"')
    expect(text(html)).toContain('เลือกโปรแกรมซ้อม')
  })

  it('opens the tournament details, says entering is a team\'s step, and is not matched yet', async () => {
    setup()
    open.tournaments = [{ id: 't-9', name: 'Lopburi Youth Cup', location: 'Lopburi', start_date: bangkok(10), end_date: bangkok(11), status: 'open' }]
    const page = text(await render(ProfilePage as never))
    open.tournaments = []
    expect(page).toContain('ดูรายละเอียด')
    expect(page).toContain('ยังไม่ได้เลือกตามรุ่นอายุหรือพื้นที่ของคุณ')
  })

  it('shows no opportunity when nothing is open', async () => {
    setup()
    expect(await render(ProfilePage as never)).not.toContain('id="pf-opp"')
  })

  it('asks an athlete without a programme to pick one, with no mission list', async () => {
    setup()
    db.tables.training_enrollments = []
    const html = await render(ProfilePage as never)
    expect(html).not.toContain('id="pf-missions"')
    expect(anchor(html, '/training')).toContain('ui-btn-primary')
  })
})

describe('/profile after the code review (3 Nov 2026)', () => {
  const base = () => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'player', onboarding_persona: 'athlete' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: true, verification_level: 'self' },
    }
    db.counts = {}
    db.failing = []
    db.private = { birth_date: '2012-03-04', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }

  it('puts a waiting team invitation on the home as one line to /team-members', async () => {
    base()
    db.tables.team_members = [{ status: 'pending', teams: { id: 't1', name: 'Lions', status: 'draft', tournaments: [] } }]
    const html = await render(ProfilePage as never)
    expect(text(html)).toContain('มีคำเชิญเข้าทีม 1 รายการ รอคุณตอบ')
    expect(anchor(html, '/team-members')).toContain('pf-team-line')
  })

  it('points an athlete with no team at how to get one', async () => {
    base()
    const html = await render(ProfilePage as never)
    expect(html).toContain('href="/me#pf-team-ask"')
    expect(await render(MePage as never)).toContain('id="pf-team-ask"')
  })

  it('says nothing about teams once the athlete is in one', async () => {
    base()
    db.tables.team_members = [{ status: 'accepted', teams: { id: 't1', name: 'Lions', status: 'confirmed', tournaments: [] } }]
    expect(await render(ProfilePage as never)).not.toContain('pf-team-line')
  })

  it('shows a dash, not 0, when this week\'s XP could not be read', async () => {
    base()
    db.tables.training_enrollments = [{ id: 'e1', program_id: 'u10-foundation-01', weekdays: [0, 1, 2, 3, 4, 5, 6], start_date: '2026-01-05', status: 'active' }]
    db.failing = ['athlete_xp_events']
    const page = text(await render(ProfilePage as never))
    db.failing = []
    expect(page).toMatch(/ — แต้มจากแมตช์/)
  })

  it('shows a private athlete\'s confirmed numbers on /me without a rank row', async () => {
    base()
    db.tables.athlete_profiles = { ...minor, display_name: 'Niran', is_public: false, verification_level: 'self' }
    db.tables.player_ratings = { matches_played: 2, goals: 1, assists: 0, mvps: 0, last_rating_change: 3 }
    expect(text(await render(MePage as never))).toMatch(/แข่ง 2 ประตู 1/)
  })
})

describe('/me, the athlete\'s profile tab (owner, 2 Nov 2026)', () => {
  const publicAthlete = (tables: Record<string, unknown> = {}) => {
    db.tables = {
      profiles: { full_name: 'Niran', role: 'organizer', onboarding_persona: 'athlete' },
      athlete_profiles: { ...minor, display_name: 'Niran', is_public: true, verification_level: 'coach_verified' },
      player_ranks: { id: 'rank-9', player_name: 'Niran', position: 'FW', ovr: 71, pts: 1520 },
      ...tables,
    }
    db.counts = {}
    db.private = { birth_date: '2012-03-04', guardian_consent_at: '2026-01-01T00:00:00Z' }
  }

  it('shows who the athlete is, who can see them, and how to edit, as quiet buttons', async () => {
    publicAthlete()
    const html = await render(MePage as never)
    const page = text(html)
    expect(page).toContain('Niran')
    expect(page).toContain('14 ปี')
    expect(page).toContain('โค้ชยืนยันแล้ว')
    expect(page).toContain('ทุกคนเห็น')
    expect(html).toContain('href="/players/rank-9"')
    expect(primaries(html)).toBe(0)
  })

  it('says private when the profile is private, and offers no public page', async () => {
    publicAthlete({ athlete_profiles: { ...minor, display_name: 'Niran', is_public: false, verification_level: 'self' } })
    const html = await render(MePage as never)
    expect(text(html)).toContain('เห็นแค่ฉัน')
    expect(text(html)).toContain('ฉันกรอกเอง')
    expect(html).not.toContain('href="/players/')
  })

  it('shows this season\'s confirmed numbers only when there is a match', async () => {
    publicAthlete({ player_ratings: { matches_played: 12, goals: 8, assists: 5, mvps: 3, last_rating_change: 4 } })
    const page = text(await render(MePage as never))
    expect(page).toMatch(/แข่ง 12 ประตู 8 แอสซิสต์ 5 ยอดเยี่ยม 3/)
    expect(page).toContain('จากผลแข่งที่ผู้จัดยืนยันเท่านั้น')
    publicAthlete({ player_ratings: { matches_played: 0, goals: 0, assists: 0, mvps: 0, last_rating_change: 0 } })
    expect(text(await render(MePage as never))).toContain('ยังไม่มีผลแข่งที่ยืนยันในฤดูกาลนี้')
  })

  it('keeps every place that left the home one tap away, with the unread count', async () => {
    publicAthlete()
    db.counts = { notifications: 2 }
    const html = await render(MePage as never)
    for (const href of ['/team-members', '/card', '/career', '/training', '/notifications', '/venues', '/sponsorships', '/dashboard']) expect(html, href).toContain(`href="${href}"`)
    expect(html).not.toContain('href="/admin"')
    expect(html).toMatch(/aria-label="ยังไม่อ่าน 2">2</)
  })

  it('holds the account, sign-out and PDPA data deletion', async () => {
    publicAthlete()
    const html = await render(MePage as never)
    expect(text(html)).toContain('athlete@example.com')
    expect(html).toContain('action="/auth/signout"')
    expect(text(html)).toContain('ลบข้อมูลของฉัน')
  })

  it('speaks English without leaking Thai, apart from the data-deletion notice', async () => {
    publicAthlete({ player_ratings: { matches_played: 2, goals: 1, assists: 0, mvps: 0, last_rating_change: 4 } })
    const html = await render(MePage as never, 'en')
    const before = text(withoutSwitch(html.slice(0, html.indexOf('ลบข้อมูลของฉัน'))))
    expect(before).toContain('Season')
    expect(before).not.toMatch(/[ก-ฺเ-๛]/)
  })
})
