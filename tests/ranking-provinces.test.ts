import { describe, expect, it } from 'vitest'
import { fetchRankingProvinces } from '@/lib/ranking-provinces'
import { PROVINCE_NAMES_EN } from '@/lib/thai-provinces'

// T10: the /ranking province filter read every player_ranks row of the season just to
// list provinces. PostgREST caps an answer at 1000 rows, so past 1000 ranked athletes
// provinces silently went missing. public_ranking_provinces (sql/59) answers one row per
// province instead.
function fakeClient(answer: { data: unknown; error: { code?: string; message: string } | null }) {
  const asked: string[] = []
  const from = (table: string) => {
    asked.push(`from ${table}`)
    const builder = {
      select: (columns: string) => { asked.push(`select ${columns}`); return builder },
      eq: (column: string, value: unknown) => { asked.push(`${column}=${value}`); return builder },
      order: (column: string) => { asked.push(`order ${column}`); return builder },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve(answer).then(resolve),
    }
    return builder
  }
  return { client: { from } as never, asked }
}

describe('ranking provinces', () => {
  it('asks the database for one row per province of the sport and season', async () => {
    const { client, asked } = fakeClient({ data: [{ province: 'เชียงใหม่' }, { province: 'กรุงเทพมหานคร' }], error: null })
    expect(await fetchRankingProvinces(client, 'football', '2026')).toEqual(['เชียงใหม่', 'กรุงเทพมหานคร'])
    expect(asked).toEqual(['from public_ranking_provinces', 'select province', 'sport=football', 'season=2026', 'order province'])
    expect(asked.join(' ')).not.toContain('player_ranks')
  })

  it('never offers an empty province', async () => {
    const { client } = fakeClient({ data: [{ province: '' }, { province: null }, { province: ' ' }, { province: 'น่าน' }], error: null })
    expect(await fetchRankingProvinces(client, 'football', '2026')).toEqual(['น่าน'])
  })

  it.each(['PGRST205', '42P01'])('until SQL59 (%s), offers all 77 provinces and reads no ranking rows', async code => {
    const { client, asked } = fakeClient({ data: null, error: { code, message: 'missing' } })
    const provinces = await fetchRankingProvinces(client, 'football', '2026')
    expect(provinces).toHaveLength(77)
    expect(new Set(provinces)).toEqual(new Set(Object.keys(PROVINCE_NAMES_EN)))
    expect(asked.filter(entry => entry.startsWith('from '))).toEqual(['from public_ranking_provinces'])
  })

  it('passes any other error on', async () => {
    const { client } = fakeClient({ data: null, error: { code: '500', message: 'boom' } })
    await expect(fetchRankingProvinces(client, 'football', '2026')).rejects.toMatchObject({ message: 'boom' })
  })
})
