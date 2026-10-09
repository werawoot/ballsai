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
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
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
})
