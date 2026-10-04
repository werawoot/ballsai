import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import { withFallback } from '@/i18n/config'
import th from '@/messages/th.json'
import en from '@/messages/en.json'
import { drawTables, fetchPublicDraw, saveFixturesPublished } from '@/lib/fixture-draw'

// The anonymous client's only door is public_tournament_fixtures (sql/57): it answers
// rows for a published draw, nothing for a private one, or an error before SQL57.
const rpc = vi.hoisted(() => ({ answer: { data: [] as unknown, error: null as null | { code?: string; message: string } } }))
const heading = { data: { name: 'City Cup', location: 'Khon Kaen', start_date: '2026-10-18', end_date: '2026-10-19' }, error: null }
const fakeClient = () => ({
  rpc: async () => rpc.answer,
  from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => heading }) }) }),
})
vi.mock('@supabase/supabase-js', () => ({ createClient: () => fakeClient() }))
const messages = withFallback(en, th)
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'en',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'en', messages, namespace } as never),
}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }), usePathname: () => '/', useSearchParams: () => new URLSearchParams() }))

import PublicFixturesPage from '@/app/tournaments/[id]/fixtures/page'

const row = (key: string, home: [string, string, number], away: [string, string, number], extra: Record<string, unknown> = {}) => ({
  fixture_key: key, stage: 'group', round: 1, group_label: 'A',
  home_team_id: home[0], away_team_id: away[0], home_name: home[1], away_name: away[1], home_order: home[2], away_order: away[2],
  home_source: null, away_source: null, home_score: null, away_score: null, winner_team_id: null, ...extra,
})
const render = async (searchParams?: Record<string, string>) => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'en', messages, timeZone: 'Asia/Bangkok' } as never,
  await (PublicFixturesPage as (props: never) => Promise<ReactElement>)({ params: { id: 'cup' }, ...(searchParams ? { searchParams: Promise.resolve(searchParams) } : {}) } as never)))

describe('a published draw, for anyone', () => {
  it('ranks the public table exactly like the organizer\'s, registration order last', async () => {
    // Late (registered 2nd) and Early (1st) draw 1-1; Third and Fourth draw 0-0.
    rpc.answer = { error: null, data: [
      row('GA-R1-M1', ['late', 'Late FC', 2], ['early', 'Early FC', 1], { home_score: 1, away_score: 1 }),
      row('GA-R1-M2', ['third', 'Third FC', 3], ['fourth', 'Fourth FC', 4], { home_score: 0, away_score: 0 }),
    ] }
    const { draw } = await fetchPublicDraw(fakeClient() as never, 'cup')
    expect(draw!.teamOrder).toEqual(['early', 'late', 'third', 'fourth'])
    expect(drawTables(draw!)[0].rows.map(item => item.teamId)).toEqual(['early', 'late', 'third', 'fourth'])
  })

  it('shows names, scores and tables, and says nothing is published when the answer is empty', async () => {
    rpc.answer = { error: null, data: [row('GA-R1-M1', ['a', 'Lions', 1], ['b', 'Tigers', 2], { home_score: 2, away_score: 0 })] }
    const published = await render()
    expect(published).toMatch(/Lions<\/span><\/span><span class="fx-score">2<\/span>.*?Tigers<\/span><\/span><span class="fx-score is-lose">0<\/span>/)
    expect(published).toContain('Group A table')
    // Which tournament, when and where, and how far it has got.
    expect(published).toContain('City Cup')
    expect(published).toContain('Khon Kaen')
    expect(published).toContain('1 of 1 matches played')
    expect(published).toContain('Match verified')
    expect(published).not.toContain('choose who won on penalties')

    rpc.answer = { error: null, data: [] }
    expect(await render()).toContain('The organizer has not published this tournament&#x27;s fixtures yet')
    rpc.answer = { error: { code: 'PGRST202', message: 'Could not find the function public.public_tournament_fixtures' }, data: null }
    expect(await render()).toContain('Fixtures are not available yet')
  })
})

describe('views of a group stage with a knockout', () => {
  const groupsAndKnockout = () => [
    row('GA-R1-M1', ['a', 'Lions', 1], ['b', 'Tigers', 2], { home_score: 2, away_score: 0 }),
    row('GB-R1-M1', ['c', 'Bears', 3], ['d', 'Wolves', 4], { group_label: 'B' }),
    row('KO-R1-M1', [null, null, 0] as never, [null, null, 0] as never, { stage: 'knockout', group_label: null, home_source: 'group:A:1', away_source: 'group:B:1' }),
  ]

  it('offers fixtures, tables and the bracket as links, and filters by group', async () => {
    rpc.answer = { error: null, data: groupsAndKnockout() }
    const html = await render({ filter: 'B' })
    for (const href of ['/tournaments/cup/fixtures', '/tournaments/cup/fixtures?view=tables', '/tournaments/cup/fixtures?view=bracket', '/tournaments/cup/fixtures?filter=knockout']) {
      expect(html).toContain(`href="${href}"`)
    }
    const main = html.slice(html.indexOf('class="fx-main"'), html.indexOf('class="fx-aside"'))
    expect(main).toContain('Bears')
    expect(main).not.toContain('Lions')
    expect(html).toContain('Top 1 go through to the knockout')
  })

  it('draws the bracket with where each place comes from until it is known', async () => {
    rpc.answer = { error: null, data: groupsAndKnockout() }
    const html = await render({ view: 'bracket' })
    expect(html).toContain('Final')
    expect(html).toContain('Group A #1')
    expect(html).toContain('Champion')
    expect(html).not.toContain('class="fx-match"')
  })
})

describe('a big draw', () => {
  // 10 teams, 9 matchdays, 45 matches + one more matchday's worth: over the 48 limit.
  const league = () => {
    const rows = []
    for (let round = 1; round <= 10; round += 1) for (let match = 1; match <= 5; match += 1) {
      const played = round <= 3
      rows.push(row(`L-R${round}-M${match}`, [`h${round}${match}`, `Home ${round}.${match}`, match], [`a${round}${match}`, `Away ${round}.${match}`, 10 + match],
        { stage: 'league', group_label: null, round, home_score: played ? 1 : null, away_score: played ? 0 : null }))
    }
    return rows
  }

  it('shows one round at a time, opening on the first round not finished, with plain links to the others', async () => {
    rpc.answer = { error: null, data: league() }
    const html = await render()
    // The fixtures column only; the table beside it lists every team.
    const main = html.slice(html.indexOf('class="fx-main"'), html.indexOf('class="fx-aside"'))
    expect(main.split('class="fx-match"').length - 1).toBe(5)
    expect(main).toContain('Home 4.1')
    expect(main).not.toContain('Home 1.1')
    expect(html).toContain('href="/tournaments/cup/fixtures?round=m3"')
    expect(html).toContain('href="/tournaments/cup/fixtures?round=m5"')
    // Full page loads: soft navigation dropped some taps on this page (QA, 4 Oct).
    expect(html).not.toMatch(/<a[^>]+class="fx-(tab|filter)[^"]*"[^>]*data-/)
  })

  it('opens the round asked for, and ignores one that does not exist', async () => {
    rpc.answer = { error: null, data: league() }
    expect(await render({ round: 'm9' })).toContain('Home 9.1')
    expect(await render({ round: 'm99' })).toContain('Home 4.1')
  })
})

describe('publishing', () => {
  it.each([
    [null, { ok: true }],
    [{ message: 'NOT_ALLOWED' }, { ok: false, code: 'fixturesNotAllowed', status: 403 }],
    [{ code: 'PGRST202', message: 'Could not find the function public.set_fixtures_published_safely' }, { ok: false, code: 'fixturesPublishMigrationMissing', status: 503 }],
    [{ message: 'boom' }, { ok: false, code: 'fixturesFailed', status: 500 }],
  ])('turns %j into the right answer', async (error, expected) => {
    const calls: unknown[] = []
    const client = { rpc: async (name: string, args: unknown) => { calls.push([name, args]); return { data: null, error } } }
    expect(await saveFixturesPublished(client as never, 'cup', true)).toEqual(expected)
    expect(calls).toEqual([['set_fixtures_published_safely', { p_tournament_id: 'cup', p_published: true }]])
  })
})
