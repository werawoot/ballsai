import { createElement, type ComponentType, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { NextIntlClientProvider, createTranslator } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import th from '@/messages/th.json'

// The database boundary for /career. player_ratings has one row per rank, sport and season
// (ballsai-rating-v1.sql); maybeSingle() over more than one row is PostgREST's PGRST116
// error, as the real API answers.
const db = vi.hoisted(() => ({ ratings: [] as Record<string, unknown>[] }))
function fakeClient() {
  const from = (table: string) => {
    let rows: Record<string, unknown>[] = table === 'player_ratings' ? db.ratings : []
    const builder: Record<string, unknown> = {}
    for (const name of ['select', 'order', 'limit', 'in']) builder[name] = () => builder
    builder.eq = (column: string, value: unknown) => { rows = rows.filter(row => !(column in row) || row[column] === value); return builder }
    builder.maybeSingle = async () => rows.length > 1
      ? { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple rows returned' } }
      : { data: table === 'athlete_profiles' ? { display_name: 'Nong A', created_at: '2026-01-01T00:00:00Z', verification_level: 'self' } : rows[0] ?? null, error: null }
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve)
    return builder
  }
  return {
    from,
    rpc: async () => ({ data: [], error: null }),
    auth: { getUser: async () => ({ data: { user: { id: 'me' } } }) },
  }
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => fakeClient() }))
vi.mock('next/headers', () => ({ cookies: () => ({ getAll: () => [], set: () => {} }) }))
vi.mock('next/navigation', () => ({ redirect: (to: string) => { throw new Error(`redirect ${to}`) } }))
vi.mock('next-intl/server', () => ({
  getLocale: async () => 'th',
  getTranslations: async (namespace?: string) => createTranslator({ locale: 'th', messages: th, namespace } as never),
}))

import CareerPage from '@/app/career/page'

const render = async () => renderToStaticMarkup(createElement(NextIntlClientProvider as ComponentType<never>, { locale: 'th', messages: th, timeZone: 'Asia/Bangkok' } as never, await (CareerPage as () => Promise<ReactElement>)()))
const rating = (season: string, power: number) => ({ id: `r-${season}`, player_id: 'me', sport: 'football', season, power_rating: power, matches_played: 4, wins: 2, goals: 3, assists: 1, clean_sheets: 0, mvps: 1, confidence: 'active' })

describe('/career reads this season\'s Power (lib/season.ts)', () => {
  it('shows this season\'s rating when the athlete also has an older season', async () => {
    db.ratings = [rating('2025', 1111), rating('2026', 1234)]
    const html = await render()
    db.ratings = []
    expect(html).toContain('1,234')
    expect(html).not.toContain('1,111')
  })
})
