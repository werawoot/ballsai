import { describe, expect, it } from 'vitest'
import { fetchPublicPlayer, servesSharedPlayerCopy } from '@/lib/public-player'

// Only a viewer with no session gets the shared (cached) copy of /players/[id]. A signed-in
// viewer may be the athlete, a guardian or a coach, whose RLS shows more than the public
// copy; they read with their own session, uncached.
describe('who gets the shared copy of a public athlete page', () => {
  it('serves it to a viewer with no cookies or only unrelated ones', () => {
    expect(servesSharedPlayerCopy([])).toBe(true)
    expect(servesSharedPlayerCopy(['NEXT_LOCALE', '_vercel_jwt'])).toBe(true)
  })

  it('never serves it to a signed-in viewer, whole or chunked session cookie', () => {
    expect(servesSharedPlayerCopy(['sb-hivedzrwrrcnjrlirhtv-auth-token'])).toBe(false)
    expect(servesSharedPlayerCopy(['NEXT_LOCALE', 'sb-hivedzrwrrcnjrlirhtv-auth-token.0', 'sb-hivedzrwrrcnjrlirhtv-auth-token.1'])).toBe(false)
  })

  it('still serves it mid sign-in, when only the OAuth code verifier is set', () => {
    expect(servesSharedPlayerCopy(['sb-hivedzrwrrcnjrlirhtv-auth-token-code-verifier'])).toBe(true)
  })
})

type Row = Record<string, unknown>

// A stand-in for PostgREST and Storage over fixed tables. Rows the viewer may not read
// (RLS) are simply absent from the tables passed in, as the real API answers.
function fakeSupabase(tables: Record<string, Row[]>, age: number | null = null, failing: string[] = []) {
  const read: string[] = []
  const from = (table: string) => {
    read.push(table)
    let rows = tables[table] ?? []
    let head = false
    const result = () => ({ data: head ? null : rows, count: rows.length, error: null })
    const builder: Record<string, unknown> = {
      select: (_columns: string, options?: { head?: boolean }) => { head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { rows = rows.filter(row => row[column] === value); return builder },
      gt: (column: string, value: number) => { rows = rows.filter(row => (row[column] as number) > value); return builder },
      lt: (column: string, value: string) => { rows = rows.filter(row => String(row[column]) < value); return builder },
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => failing.includes(table) ? { data: null, error: { code: '57014', message: 'timeout' } } : { data: rows[0] ?? null, error: null },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    }
    return builder
  }
  const client = {
    from,
    rpc: async () => ({ data: age, error: null }),
    storage: { from: () => ({ createSignedUrls: async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://signed/${path}`, error: null })), error: null }) }) },
  }
  return { client: client as never, read }
}

const U1 = '11111111-1111-4111-8111-111111111111'
const ranked = {
  player_ranks: [{ id: 'r1', player_id: U1, player_name: 'Nong A', sport: 'football', season: '2026', pts: 900 }],
  athlete_profiles: [{ user_id: U1, display_name: 'Nong A', profile_image_url: null, verification_level: 'self' }],
  player_ratings: [{ id: 'pr1', player_rank_id: 'r1', sport: 'football', season: '2026', matches_played: 3, power_rating: 1100 }],
  rating_events: [{ player_rating_id: 'pr1', result: 'win', created_at: '2026-10-01T00:00:00Z' }],
}

describe('what a public athlete page reads', () => {
  it('finds a ranked athlete by rank id, with their profile, age, season and form', async () => {
    const { client } = fakeSupabase(ranked, 14)
    const page = await fetchPublicPlayer(client, 'r1')
    expect(page?.rank?.id).toBe('r1')
    expect(page?.profile?.display_name).toBe('Nong A')
    expect(page?.age).toBe(14)
    expect(page?.rating?.matches_played).toBe(3)
    expect(page?.events).toHaveLength(1)
    expect(page?.position?.position).toBe(1)
  })

  it('shows a public athlete with no rank row as a STARTER, by user id, with no Power or season', async () => {
    const { client } = fakeSupabase({ athlete_profiles: ranked.athlete_profiles }, 12)
    const page = await fetchPublicPlayer(client, U1)
    expect(page?.rank).toBeNull()
    expect(page?.profile?.display_name).toBe('Nong A')
    expect(page?.rating).toBeNull()
    expect(page?.position).toBeNull()
    expect(page?.events).toEqual([])
  })

  it('has nothing to show when the id is unknown or the profile is private to this reader', async () => {
    // RLS hides a private profile from the anon reader: the table simply has no row.
    const { client } = fakeSupabase({ athlete_profiles: [] })
    expect(await fetchPublicPlayer(client, U1)).toBeNull()
    expect(await fetchPublicPlayer(client, 'not-a-rank')).toBeNull()
  })

  it('signs a public photo for the reader instead of passing the stored path on', async () => {
    const withPhoto = [{ ...ranked.athlete_profiles[0], profile_image_url: `${U1}/face.webp` }]
    const { client } = fakeSupabase({ ...ranked, athlete_profiles: withPhoto })
    const page = await fetchPublicPlayer(client, 'r1')
    expect(page?.profile?.profile_image_url).toBe(`https://signed/${U1}/face.webp`)
  })

  // The shared copy is cached for everyone; a database hiccup must not be cached as
  // "no such athlete" and send every visitor away for a minute.
  it('throws instead of answering "not found" when the rank or profile read fails', async () => {
    await expect(fetchPublicPlayer(fakeSupabase(ranked, null, ['player_ranks']).client, 'r1')).rejects.toThrow()
    await expect(fetchPublicPlayer(fakeSupabase(ranked, null, ['athlete_profiles']).client, 'r1')).rejects.toThrow()
  })
})
