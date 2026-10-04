import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'

// The database boundary: tables answered with eq filters, ranges, head counts and single
// rows. db.missing makes tournament_fixtures answer as a table SQL55 has not created yet.
const db = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>, user: 'org-1', missing: false }))
function fakeClient() {
  const from = (table: string) => {
    let rows = db.tables[table] ?? []
    let head = false
    let window: [number, number] | null = null
    const builder = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      in: (column: string, values: unknown[]) => { rows = rows.filter(row => values.includes(row[column])); return builder },
      order: () => builder,
      limit: () => builder,
      range: (start: number, end: number) => { window = [start, end]; return builder },
      single: async () => ({ data: rows[0] ?? null, error: null }),
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
      then: (resolve: (value: unknown) => unknown) => {
        if (table === 'tournament_fixtures' && db.missing) return Promise.resolve({ data: null, error: { code: 'PGRST205', message: 'missing' } }).then(resolve)
        return Promise.resolve(head ? { data: null, count: rows.length, error: null } : { data: window ? rows.slice(window[0], window[1] + 1) : rows, error: null }).then(resolve)
      },
    }
    return builder
  }
  return { from, auth: { getUser: async () => ({ data: { user: { id: db.user } } }) } }
}
vi.mock('@/lib/supabase-server', () => ({ createServerSupabaseClient: async () => fakeClient() }))
vi.mock('next/navigation', () => ({
  redirect: (to: string) => { throw new Error(`redirect ${to}`) },
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}))
const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))

import FixturesPage from '@/app/dashboard/tournaments/[id]/fixtures/page'

const render = async () => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'en', messages, timeZone: 'Asia/Bangkok' } as never,
  await (FixturesPage as (props: never) => Promise<ReactElement>)({ params: { id: 'cup' } } as never)))

const tables = (fixtures: Record<string, unknown>[] = []) => ({
  profiles: [{ id: 'org-1', role: 'organizer' }, { id: 'org-2', role: 'organizer' }],
  tournaments: [{ id: 'cup', name: 'City Cup', organizer_id: 'org-1' }],
  teams: [
    { id: 'a', name: 'Lions', tournament_id: 'cup', status: 'confirmed' },
    { id: 'b', name: 'Tigers', tournament_id: 'cup', status: 'confirmed' },
    { id: 'c', name: 'Bears', tournament_id: 'cup', status: 'pending' },
  ],
  tournament_fixtures: fixtures.map(fixture => ({ tournament_id: 'cup', match_result_id: null, group_label: null, home_source: null, away_source: null, ...fixture })),
})

describe('/dashboard/tournaments/[id]/fixtures', () => {
  it('shows the organizer the confirmed-team count, the draw form and every fixture by round', async () => {
    db.user = 'org-1'; db.missing = false
    db.tables = tables([
      { fixture_key: 'KO-R1-M1', stage: 'knockout', round: 1, home_team_id: 'a', away_team_id: 'b' },
      { fixture_key: 'KO-R2-M1', stage: 'knockout', round: 2, home_team_id: null, away_team_id: null, home_source: 'winner:KO-R1-M1', away_source: 'group:A:2' },
    ])
    const html = await render()
    expect(html).toContain('2 confirmed teams')
    expect(html).toContain('Redraw (replaces the current one)')
    // Two knockout rounds read as the semi-finals and the final, not "round 1" and "round 2".
    expect(html).toContain('Semi-finals')
    expect(html).toContain('Final')
    expect(html).toMatch(/Lions<\/span><\/span><span class="fx-vs">Not played<\/span>.*Tigers/)
    expect(html).toContain('Winner of Semi-finals, match 1')
    expect(html).toContain('Group A #2')
    // A draw exists: the organizer may publish it, and nothing is public until they do.
    expect(html).toContain('Publish fixtures')
    expect(html).toContain('Not published')
  })

  it('refuses another organizer', async () => {
    db.user = 'org-2'; db.missing = false; db.tables = tables()
    const html = await render()
    expect(html).toContain('This tournament was not found, or you do not organise it')
    expect(html).not.toContain('Make the draw')
  })

  it('says so, and offers no draw, until SQL55 is applied', async () => {
    db.user = 'org-1'; db.missing = true; db.tables = tables()
    const html = await render()
    expect(html).toContain('Fixtures are not switched on yet (SQL55 pending)')
    expect(html).not.toContain('Make the draw')
  })

  it('shows scores the right way round, a group table, and asks for the winner of a drawn knockout', async () => {
    db.user = 'org-1'; db.missing = false
    db.tables = {
      ...tables([
        // The result was entered as Tigers (b) 3 - 1 Lions (a); the fixture has Lions at home.
        { fixture_key: 'GA-R1-M1', stage: 'group', round: 1, group_label: 'A', home_team_id: 'a', away_team_id: 'b', match_result_id: 'r1' },
        { fixture_key: 'KO-R1-M1', stage: 'knockout', round: 1, home_team_id: 'a', away_team_id: 'b', match_result_id: 'r2', winner_team_id: null },
      ]),
      match_results: [
        { id: 'r1', team_a_id: 'b', team_b_id: 'a', team_a_score: 3, team_b_score: 1, status: 'confirmed' },
        { id: 'r2', team_a_id: 'a', team_b_id: 'b', team_a_score: 2, team_b_score: 2, status: 'confirmed' },
      ],
    }
    const html = await render()
    expect(html).toMatch(/Lions<\/span><\/span><span class="fx-score is-lose">1<\/span>.*?Tigers<\/span><\/span><span class="fx-score">3<\/span>/)
    expect(html).toContain('Group A table')
    expect(html).toMatch(/<span class="fx-pos">1<\/span>Tigers<\/th>(<td[^>]*>[^<]*<\/td>){5}<td[^>]*>3<\/td>/)
    expect(html).toContain('Drawn — choose who won on penalties')
    expect(html).toContain('Lions won')
  })

  it('marks a knockout decided on penalties instead of asking again', async () => {
    db.user = 'org-1'; db.missing = false
    db.tables = {
      ...tables([{ fixture_key: 'KO-R1-M1', stage: 'knockout', round: 1, home_team_id: 'a', away_team_id: 'b', match_result_id: 'r2', winner_team_id: 'b' }]),
      match_results: [{ id: 'r2', team_a_id: 'a', team_b_id: 'b', team_a_score: 1, team_b_score: 1, status: 'confirmed' }],
    }
    const html = await render()
    expect(html).toContain('Tigers won on penalties')
    expect(html).not.toContain('choose who won on penalties')
  })

  it('locks the draw once a fixture has a result', async () => {
    db.user = 'org-1'; db.missing = false
    db.tables = tables([{ fixture_key: 'L-R1-M1', stage: 'league', round: 1, home_team_id: 'a', away_team_id: 'b', match_result_id: 'r1' }])
    const html = await render()
    expect(html).toContain('Results are recorded, so this draw cannot be redrawn')
    expect(html).not.toContain('Redraw')
  })
})
