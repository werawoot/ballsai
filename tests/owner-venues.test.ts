import { describe, expect, it } from 'vitest'
import { OWNER_SLOT_DAYS_BACK, OWNER_SLOTS_PER_COURT, fetchOwnerVenues } from '@/lib/owner-venues'

// T61: /venue read every slot every court ever had. Slots are created ahead in bulk and never
// deleted, so the page grew with every week a venue was open.
function fakeSupabase(rows: unknown[]) {
  const asked: string[] = []
  const builder: Record<string, unknown> = {
    select: (columns: string) => { asked.push(`select ${columns}`); return builder },
    eq: (column: string, value: unknown) => { asked.push(`${column}=${value}`); return builder },
    gte: (column: string, value: unknown) => { asked.push(`${column}>=${value}`); return builder },
    order: (column: string, options?: { ascending?: boolean; referencedTable?: string }) => { asked.push(`order ${options?.referencedTable ? `${options.referencedTable}.` : ''}${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
    limit: (count: number, options?: { referencedTable?: string }) => { asked.push(`limit ${options?.referencedTable ?? ''} ${count}`); return builder },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve),
  }
  return { client: { from: (table: string) => { asked.push(`from ${table}`); return builder } } as never, asked }
}

describe("a venue owner's schedule, from a week ago onward", () => {
  const now = new Date('2026-10-23T05:00:00Z')

  it('reads only slots from a week back, in time order, capped per court', async () => {
    const { client, asked } = fakeSupabase([])
    await fetchOwnerVenues(client, 'owner-1', now)
    expect(OWNER_SLOT_DAYS_BACK).toBe(7)
    expect(asked).toContain('owner_id=owner-1')
    expect(asked).toContain('venue_courts.venue_slots.starts_at>=2026-10-16T05:00:00.000Z')
    expect(asked).toContain('order venue_courts.venue_slots.starts_at asc')
    expect(asked).toContain(`limit venue_courts.venue_slots ${OWNER_SLOTS_PER_COURT}`)
  })

  it('returns the venues as read', async () => {
    const venue = { id: 'v1', name: 'สนามหญ้าเทียม', venue_courts: [{ id: 'c1', name: 'คอร์ท 1', venue_slots: [{ id: 's1', starts_at: '2026-10-24T10:00:00Z' }] }] }
    const { client } = fakeSupabase([venue])
    expect(await fetchOwnerVenues(client, 'owner-1', now)).toEqual({ venues: [venue], error: null })
  })
})
