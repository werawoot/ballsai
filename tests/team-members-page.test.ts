import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

// The database is the boundary: tables answered with eq/in filters, as PostgREST would.
// The signed-in user is db.user.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, user: 'u1', failing: new Set<string>() }))
function fakeClient() {
  const from = (table: string) => {
    let rows = db.tables[table] ?? []
    const builder = {
      select: () => builder,
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      limit: () => builder,
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(db.failing.has(table) ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }).then(resolve),
    }
    return builder
  }
  // Functions (sql/70 my_upcoming_team_events, sql/71 my_team_announcements): the seeded
  // rows under the function's name, or missing like before the file.
  const rpc = async (name: string) => (db.tables[name] ? { data: db.tables[name], error: null } : { data: null, error: { code: 'PGRST202', message: 'missing' } })
  return { from, rpc, auth: { getUser: async () => ({ data: { user: { id: db.user } } }) } }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/team-members',
}))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'th', messages: th, namespace } as never),
}))

import TeamMembersPage from '@/app/team-members/page'

const render = async () =>
  renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
    await (TeamMembersPage as () => Promise<ReactElement>)()))
const hrefs = (html: string) => [...html.matchAll(/href="([^"]+)"/g)].map(match => match[1])

const team = { id: 'tm1', name: 'ขอนแก่น U13', tournament_id: 't1', status: 'draft', created_by: 'u1', created_at: '2026-10-01', tournaments: { name: 'ศึกชิงถ้วย', fee: 1500 } }
const invite = { id: 'm1', team_id: 'tm9', athlete_id: 'u1', status: 'pending', invited_at: '2026-10-01', created_at: '2026-10-01', teams: { name: 'ทีมที่เชิญ' } }

describe('/team-members for someone with no team and no invitation', () => {
  it('says there is no team yet and offers the tournaments, not a card about invitations', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('ยังไม่มีทีม')
    expect(hrefs(html)).toContain('/tournaments')
    expect(html).not.toContain('คำเชิญของฉัน')
    expect(html).not.toContain('เชิญนักกีฬา')
  })

  it('tells an athlete where invitations will appear', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [], coach_attestations: [] }
    expect(await render()).toContain('โค้ชจะส่งคำเชิญมาที่นี่')
  })
})

describe('/team-members when there is something to show', () => {
  it('shows a pending invitation to an athlete without the empty state', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [invite], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('ทีมที่เชิญ')
    expect(html).toContain('คำเชิญของฉัน')
    expect(html).not.toContain('ยังไม่มีทีม')
  })

  it('shows a coach their team and the invite form, with no empty "my invitations" card', async () => {
    db.user = 'u1'; db.tables = { teams: [team], team_members: [], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('เชิญนักกีฬาคนแรก')
    expect(html).not.toContain('คำเชิญของฉัน')
    expect(html).not.toContain('ยังไม่มีทีม')
  })
})

describe('an invitation says what each answer does, in words', () => {
  const pendingInvite = { ...invite }
  it('has labelled buttons and one sentence for each answer', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [pendingInvite], coach_attestations: [] }
    const html = await render()
    expect(html).toMatch(/<button[^>]*>[^<]*เข้าร่วมทีม/)
    expect(html).toMatch(/<button[^>]*>[^<]*ไม่เข้าร่วม/)
    expect(html).toContain('โค้ชเลือกคุณลงผลแข่งของทีมนี้ได้เมื่อทีมได้รับการยืนยัน และโค้ชจะเห็นชื่อในโปรไฟล์ของคุณ')
    expect(html).toContain('โค้ชจะเห็นว่าคุณไม่เข้าร่วม')
  })

  it('shows no answer buttons once answered', async () => {
    db.user = 'u1'; db.tables = { teams: [], team_members: [{ ...invite, status: 'accepted' }], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('เข้าร่วมแล้ว')
    expect(html).not.toContain('ไม่เข้าร่วม')
  })
})

describe('/team-members: the second of the three steps (UX mockup v3-A)', () => {
  const member = (id: string, status: string) => ({ id, team_id: 'tm1', athlete_id: `a-${id}`, status, invited_at: '2026-10-02', created_at: '2026-10-02', athlete_profiles: { display_name: `Player ${id}` } })
  const coach = (members: ReturnType<typeof member>[] = [], teams: typeof team[] = [team]) => {
    db.user = 'u1'; db.failing = new Set()
    db.tables = { teams, team_members: members, coach_attestations: [] }
  }

  it('shows the three steps, the second one current, and asks for one email first', async () => {
    coach()
    const html = await render()
    expect(html).toContain('สร้างทีม')
    expect(html).toContain('เชิญสมาชิก')
    expect(html).toContain('ส่งสมัครและชำระเงิน')
    expect(html).toContain('aria-current="step"')
    expect(html).toContain('เชิญนักกีฬาคนแรก')
    expect(html.match(/type="email"/g)).toHaveLength(1)
    expect(html).not.toContain('<textarea')
  })

  it('a free tournament\'s steps and button say submit, not pay', async () => {
    coach([], [{ ...team, tournaments: { name: 'ศึกชิงถ้วย', fee: 0 } }])
    const html = await render()
    expect(html).toContain('>ส่งสมัคร<')
    expect(html).not.toContain('ส่งสมัครและชำระเงิน')
    expect(html).not.toContain('ไปขั้นชำระเงิน')
  })

  it('puts the invitation form before the roster overview', async () => {
    coach()
    const html = await render()
    expect(html.indexOf('type="email"')).toBeGreaterThan(-1)
    expect(html.indexOf('type="email"')).toBeLessThan(html.indexOf('นำออกแล้ว'))
  })

  it('says why the team cannot be submitted yet, and disables the button', async () => {
    coach([member('1', 'pending')])
    const html = await render()
    expect(html).toContain('ส่งสมัครได้เมื่อมีนักกีฬาตอบรับอย่างน้อย 1 คน (ตอนนี้ 0 คน)')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>[^<]*ส่งสมัครรายการ/)
  })

  it('lets the coach submit once one athlete has accepted', async () => {
    coach([member('1', 'accepted')])
    const html = await render()
    expect(html).not.toContain('ส่งสมัครได้เมื่อมีนักกีฬาตอบรับอย่างน้อย 1 คน')
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>[^<]*ส่งสมัครรายการ/)
    expect(html).toMatch(/<button[^>]*>[^<]*ส่งสมัครรายการ/)
  })

  it('asks which team only when there is more than one', async () => {
    coach()
    expect(await render()).not.toContain('<select')
    coach([], [team, { ...team, id: 'tm2', name: 'ทีมที่สอง' }])
    expect(await render()).toContain('<select')
  })
})

describe('/team-members when a lookup fails', () => {
  it('says the team could not be loaded instead of "no team yet"', async () => {
    db.user = 'u1'; db.failing = new Set(['teams'])
    db.tables = { teams: [team], team_members: [], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('โหลดข้อมูลทีมไม่สำเร็จ')
    expect(html).not.toContain('ยังไม่มีทีม')
  })

  it('says the invitations could not be loaded instead of "no team yet"', async () => {
    db.user = 'u1'; db.failing = new Set(['team_members'])
    db.tables = { teams: [], team_members: [invite], coach_attestations: [] }
    const html = await render()
    expect(html).toContain('โหลดข้อมูลทีมไม่สำเร็จ')
    expect(html).not.toContain('ยังไม่มีทีม')
  })
})

describe('/team-members: a skill rating from the coach waits for the athlete (sql/69)', () => {
  it('shows the pending rating with accept and decline, and says what each does', async () => {
    db.user = 'u1'
    db.failing = new Set()
    db.tables = { teams: [], team_members: [invite], coach_attestations: [], coach_skill_assessments: [
      { id: 'p1', athlete_id: 'u1', status: 'pending', created_at: '2026-10-09', speed: 70, stamina: null, strength: null, technique: 64, vision: null, teams: { name: 'ขอนแก่น U13' } },
      { id: 'p2', athlete_id: 'u1', status: 'accepted', created_at: '2026-10-01', speed: 50, stamina: null, strength: null, technique: null, vision: null, teams: { name: 'ทีมเก่า' } },
    ] }
    const html = await render()
    expect(html).toContain(th.coachSkills.inboxTitle)
    expect(html).toContain('จากโค้ชทีม ขอนแก่น U13')
    expect(html).toContain('>ยอมรับ<')
    expect(html).toContain('>ไม่ยอมรับ<')
    expect(html).not.toContain('ทีมเก่า')
  })

  it('shows nothing about ratings before SQL69 exists', async () => {
    db.user = 'u1'
    db.failing = new Set(['coach_skill_assessments'])
    db.tables = { teams: [], team_members: [invite], coach_attestations: [] }
    const html = await render()
    expect(html).not.toContain(th.coachSkills.inboxTitle)
    db.failing = new Set()
  })
})

describe('/team-members team events (sql/70)', () => {
  it('shows an athlete their upcoming event with มาได้ / มาไม่ได้', async () => {
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [], my_upcoming_team_events: [
      { event_id: 'e1', team_id: 'tm1', team_name: 'ขอนแก่น U13', kind: 'training', title: 'ซ้อมเย็นวันพุธ', starts_at: '2026-10-14T10:00:00Z', location: 'สนามโรงเรียน', note: null, athlete_id: 'u1', athlete_name: 'ต้น', answer: 'no' },
    ] }
    const html = await render()
    expect(html).toContain(th.teamEvents.myTitle)
    expect(html).toContain('ซ้อมเย็นวันพุธ')
    expect(html).toMatch(/aria-pressed="true"[^>]*>มาไม่ได้</)
  })
})

describe('/team-members team announcements (sql/71)', () => {
  it('shows the newest message first and marks an unread one as new', async () => {
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [], my_team_announcements: [
      { id: 'n2', team_name: 'ขอนแก่น U13', body: 'เลื่อนซ้อมเป็น 5 โมงเย็น ใส่ชุดสีแดง', created_at: '2026-10-12T09:00:00Z', read_at: null },
      { id: 'n1', team_name: 'ขอนแก่น U13', body: 'พรุ่งนี้ซ้อมตามปกติ', created_at: '2026-10-11T09:00:00Z', read_at: '2026-10-11T10:00:00Z' },
    ] }
    const html = await render()
    expect(html).toContain(th.teamNews.myTitle)
    expect(html.indexOf('เลื่อนซ้อมเป็น 5 โมงเย็น')).toBeLessThan(html.indexOf('พรุ่งนี้ซ้อมตามปกติ'))
    expect(html.match(new RegExp(`>${th.teamNews.unread}<`, 'g'))).toHaveLength(1)
  })

  it('shows no announcement section before SQL71 is applied', async () => {
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [] }
    expect(await render()).not.toContain(th.teamNews.myTitle)
  })
})

describe('/team-members team training plan (sql/72)', () => {
  it("marks today, links a library drill to its how-to and words the load", async () => {
    const { weekStartOf, weekdayOf } = await import('@/lib/team-training')
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [], my_team_training_plans: [
      { team_id: 'tm1', team_name: 'ขอนแก่น U13', week_start: weekStartOf(Date.now()), days: [{ day: weekdayOf(Date.now()), title: 'บอลติดเท้า', blocks: [
        { drill: 'a1-react-jog', name: 'วิ่งเหยาะ หยุดและเปลี่ยนทิศตามสัญญาณ', minutes: 10, load: 1 },
        { drill: null, name: 'เกมเล็ก 5 ต่อ 5', minutes: 25, load: 3 },
      ] }] },
    ] }
    const html = await render()
    expect(html).toContain(th.teamTraining.today)
    expect(html).toContain('href="/training/drills/a1-react-jog"')
    expect(html).toContain('เกมเล็ก 5 ต่อ 5')
    expect(html).toContain('25 นาที · หนัก')
  })

  it('shows no plan section before SQL72 is applied', async () => {
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [] }
    expect(await render()).not.toContain(th.teamTraining.myTitle)
  })
})


describe('/team-members plan days already past', () => {
  it('leaves out the days of this week that are over', async () => {
    const { weekStartOf, weekdayOf } = await import('@/lib/team-training')
    const today = weekdayOf(Date.now())
    const days = [{ day: today, title: '', blocks: [{ drill: null, name: 'วันนี้ซ้อม', minutes: 10, load: 1 }] }]
    if (today > 0) days.unshift({ day: (today - 1) as typeof today, title: '', blocks: [{ drill: null, name: 'เมื่อวานซ้อม', minutes: 10, load: 1 }] })
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [], my_team_training_plans: [{ team_id: 'tm1', team_name: 'ทีม', week_start: weekStartOf(Date.now()), days }] }
    const html = await render()
    expect(html).toContain('วันนี้ซ้อม')
    expect(html).not.toContain('เมื่อวานซ้อม')
  })
})

describe('/team-members coach notes (sql/73)', () => {
  it('shows the athlete the notes about them, with no report button once reported', async () => {
    db.user = 'u1'; db.failing = new Set(); db.tables = { teams: [], team_members: [], coach_attestations: [], my_coach_notes: [
      { id: 'n1', team_name: 'ขอนแก่น U13', athlete_id: 'u1', athlete_name: 'ต้น', category: 'goal', body: 'ฝึกยิงเท้าซ้ายวันละ 20 ครั้ง', created_at: '2026-10-10T03:00:00Z', expires_at: '2027-10-10T03:00:00Z', reported: true },
    ] }
    const html = await render()
    expect(html).toContain(th.coachNotes.myNotice)
    expect(html).toContain('ฝึกยิงเท้าซ้ายวันละ 20 ครั้ง')
    expect(html).not.toContain('เกี่ยวกับ ต้น')
    expect(html).not.toContain(th.coachNotes.report + '<')
    expect(html).toContain(th.coachNotes.reported)
  })
})

