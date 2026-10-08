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
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(db.failing.has(table) ? { data: null, error: { message: 'boom' } } : { data: rows, error: null }).then(resolve),
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: db.user } } }) } }
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

const team = { id: 'tm1', name: 'ขอนแก่น U13', tournament_id: 't1', status: 'draft', created_by: 'u1', created_at: '2026-10-01', tournaments: { name: 'ศึกชิงถ้วย' } }
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
