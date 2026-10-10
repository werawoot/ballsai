import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

// /team-members/[teamId]: only the coach who created the team sees it, numbers come from
// confirmed results only, and the team sheet holds a name and a position.
const db = vi.hoisted(() => ({ user: 'coach-1', tables: {} as Record<string, Record<string, unknown>[]>, missing: [] as string[] }))
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => ({
  auth: { getUser: async () => ({ data: { user: { id: db.user } } }) },
  from: (table: string) => {
    let rows = db.tables[table] ?? []
    const builder = {
      select: () => builder,
      // A dotted column filters on an embedded row (team_events!inner(team_id)).
      eq: (column: string, value: unknown) => { const [head, tail] = column.split('.'); rows = rows.filter(row => (tail ? (row[head] as Record<string, unknown> | null)?.[tail] : row[column]) === value); return builder },
      gte: (column: string, value: string) => { rows = rows.filter(row => String(row[column]) >= value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      limit: () => builder,
      or: (filter: string) => { const ids = [...filter.matchAll(/team_[ab]_id\.eq\.([^,]+)/g)].map(m => m[1]); rows = rows.filter(row => ids.includes(row.team_a_id as string) || ids.includes(row.team_b_id as string)); return builder },
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(db.missing.includes(table) ? { data: null, error: { code: 'PGRST205', message: 'missing' } } : { data: rows, error: null }).then(resolve),
    }
    return builder
  },
}) }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('not found') },
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  usePathname: () => '/', useRouter: () => ({ push: () => {} }), useSearchParams: () => new URLSearchParams(),
}))
vi.mock('next-intl/server', () => ({ getTranslations: async (namespace: string) => createTranslator({ locale: 'th', messages: th, namespace: namespace as never }) }))

import TeamPage from '@/app/team-members/[teamId]/page'

const render = async () => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never,
  await (TeamPage as (props: never) => Promise<ReactElement>)({ params: Promise.resolve({ teamId: 'team-1' }) } as never)))

const seed = () => {
  db.user = 'coach-1'
  db.missing = []
  db.tables = {
    teams: [{ id: 'team-1', name: 'ขอนแก่น U13', tournament_id: 'cup', created_by: 'coach-1', tournaments: { name: 'BallDoenSai ทดสอบรอบแรก', start_date: '2026-10-24' } }],
    team_members: [
      { team_id: 'team-1', athlete_id: 'a-ton', status: 'accepted', athlete_profiles: { display_name: 'ต้น', position: 'FW' } },
      { team_id: 'team-1', athlete_id: 'a-palm', status: 'accepted', athlete_profiles: { display_name: 'ปาล์ม', position: 'GK' } },
      { team_id: 'team-1', athlete_id: 'a-wait', status: 'pending', athlete_profiles: { display_name: 'รอตอบ', position: 'MF' } },
    ],
    match_results: [
      { id: 'm1', tournament_id: 'cup', team_a_id: 'team-1', team_b_id: 'team-2', status: 'confirmed' },
      { id: 'm2', tournament_id: 'cup', team_a_id: 'team-2', team_b_id: 'team-1', status: 'void' },
    ],
    match_player_performances: [
      { match_result_id: 'm1', team_id: 'team-1', player_rank_id: 'r-ton', goals: 2, assists: 0, mvp: true },
      { match_result_id: 'm2', team_id: 'team-1', player_rank_id: 'r-ton', goals: 7, assists: 0, mvp: false },
    ],
    player_ranks: [{ id: 'r-ton', player_id: 'a-ton' }],
  }
}

describe('/team-members/[teamId]', () => {
  it('shows the coach their team: confirmed numbers only, a dash for no match, accepted members only', async () => {
    seed()
    const html = await render()
    expect(html).toContain('ขอนแก่น U13')
    expect(html).toMatch(/ต้น<small>FW<\/small><\/th><td>1<\/td><td>2<\/td>/)
    expect(html).toMatch(/ปาล์ม<small>GK<\/small><\/th><td>—<\/td>/)
    expect(html).not.toContain('รอตอบ')
    expect(html).not.toContain('>7<')
  })

  it('puts the keeper first on the team sheet and states what it leaves out', async () => {
    seed()
    const html = await render()
    expect(html.indexOf('<b>ปาล์ม</b>')).toBeLessThan(html.indexOf('<b>ต้น</b>'))
    expect(html).toContain(th.teamPage.sheetPrivacy)
  })

  it('is not found for anyone but the coach who created the team', async () => {
    seed()
    db.user = 'someone-else'
    await expect(render()).rejects.toThrow('not found')
  })

  it('offers the coach a skill rating per accepted member, with where each one stands (sql/69)', async () => {
    seed()
    db.tables.coach_skill_assessments = [{ team_id: 'team-1', athlete_id: 'a-ton', status: 'pending', created_at: '2026-10-09T00:00:00Z', speed: 70, stamina: null, strength: null, technique: null, vision: null }]
    const html = await render()
    expect(html).toContain(th.coachSkills.title)
    expect(html).toContain(th.coachSkills.status.pending)
    expect(html).toContain('คือยังไม่ประเมิน')
  })

  it('says the rating is not on yet, instead of failing, before SQL69 is applied', async () => {
    seed()
    db.missing = ['coach_skill_assessments']
    const html = await render()
    expect(html).toContain(th.coachSkills.notReady)
    expect(html).toContain('ขอนแก่น U13')
  })

  describe('team events (sql/70)', () => {
    const inDays = (days: number) => new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
    const events = () => [
      { id: 'e-next', team_id: 'team-1', kind: 'training', title: 'ซ้อมเย็นวันพุธ', starts_at: inDays(2), location: 'สนามโรงเรียน', cancelled_at: null },
      { id: 'e-gone', team_id: 'team-1', kind: 'match', title: 'นัดที่ยกเลิก', starts_at: inDays(3), location: null, cancelled_at: inDays(-1) },
      { id: 'e-last', team_id: 'team-1', kind: 'training', title: 'ซ้อมเมื่อวาน', starts_at: inDays(-1), location: null, cancelled_at: null },
      { id: 'e-other', team_id: 'team-2', kind: 'training', title: 'ทีมอื่น', starts_at: inDays(2), location: null, cancelled_at: null },
    ]

    it('lists upcoming with who answered, leaves out cancelled and other teams, and shows attendance', async () => {
      seed()
      db.tables.team_events = events()
      db.tables.team_event_responses = [{ event_id: 'e-next', athlete_id: 'a-ton', answer: 'yes' }, { event_id: 'e-next', athlete_id: 'a-wait', answer: 'no' }]
      db.tables.team_event_attendance = [
        { event_id: 'e-last', athlete_id: 'a-ton', present: true, team_events: { team_id: 'team-1' } },
        { event_id: 'e-last', athlete_id: 'a-palm', present: false, team_events: { team_id: 'team-1' } },
      ]
      const html = await render()
      expect(html).toContain('ซ้อมเย็นวันพุธ')
      expect(html).toContain('สนามโรงเรียน')
      expect(html).not.toContain('นัดที่ยกเลิก')
      expect(html).not.toContain('ทีมอื่น')
      // A pending member's answer is not counted: 1 yes, 0 no, 1 waiting of two accepted.
      expect(html).toContain('มา 1 · ไม่มา 0 · ยังไม่ตอบ 1')
      expect(html).toContain('เช็กชื่อแล้ว: มา 1 คน')
      expect(html).toMatch(/ต้น<small>FW<\/small><\/th>(<td>[^<]*<\/td>){4}<td>100%<\/td>/)
      expect(html).toMatch(/ปาล์ม<small>GK<\/small><\/th>(<td>[^<]*<\/td>){4}<td>0%<\/td>/)
    })

    it('shows a dash, not 0%, for a member never checked', async () => {
      seed()
      db.tables.team_events = events()
      db.tables.team_event_attendance = []
      const html = await render()
      expect(html).toMatch(/ต้น<small>FW<\/small><\/th>(<td>[^<]*<\/td>){4}<td>—<\/td>/)
      expect(html).toContain(th.teamEvents.attendanceNone)
    })

    it('says events are not on yet, instead of failing, before SQL70 is applied', async () => {
      seed()
      db.missing = ['team_events']
      const html = await render()
      expect(html).toContain(th.teamEvents.notReady)
      expect(html).toContain('ขอนแก่น U13')
    })
  })

  describe('team announcements (sql/71)', () => {
    it('lists sent messages with who they went to and how many have read them', async () => {
      seed()
      db.tables.team_announcements = [
        { id: 'n1', team_id: 'team-1', body: 'เลื่อนซ้อมเป็น 5 โมงเย็น', created_at: '2026-10-12T09:00:00Z', to_athletes: true, to_guardians: true },
        { id: 'n9', team_id: 'team-2', body: 'ของทีมอื่น', created_at: '2026-10-12T09:00:00Z', to_athletes: true, to_guardians: false },
      ]
      db.tables.team_announcement_recipients = [
        { announcement_id: 'n1', read_at: '2026-10-12T10:00:00Z' },
        { announcement_id: 'n1', read_at: null },
        { announcement_id: 'n1', read_at: '2026-10-12T11:00:00Z' },
      ]
      const html = await render()
      expect(html).toContain('เลื่อนซ้อมเป็น 5 โมงเย็น')
      expect(html).not.toContain('ของทีมอื่น')
      expect(html).toContain('นักกีฬา + ผู้ปกครอง · อ่านแล้ว 2 จาก 3')
    })

    it('says announcements are not on yet before SQL71 is applied', async () => {
      seed()
      db.missing = ['team_announcements']
      expect(await render()).toContain(th.teamNews.notReady)
    })

    it('offers a reminder only on an upcoming event someone has not answered', async () => {
      seed()
      const soon = new Date(Date.now() + 2 * 86400000).toISOString()
      db.tables.team_events = [{ id: 'e1', team_id: 'team-1', kind: 'training', title: 'ซ้อม', starts_at: soon, location: null, cancelled_at: null }]
      db.tables.team_event_responses = [{ event_id: 'e1', athlete_id: 'a-ton', answer: 'yes' }]
      expect(await render()).toContain('เตือนคนที่ยังไม่ตอบ (1)')
      db.tables.team_event_responses.push({ event_id: 'e1', athlete_id: 'a-palm', answer: 'no' })
      expect(await render()).not.toContain('เตือนคนที่ยังไม่ตอบ')
    })
  })
})

