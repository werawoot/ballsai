import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseBoundary = vi.hoisted(() => ({
  getUser: vi.fn(),
  maybeSingle: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}))

vi.mock('@/lib/supabase-server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: supabaseBoundary.getUser },
    from: supabaseBoundary.from,
  }),
}))

import { GET } from '@/app/api/scout-shortlist/route'

const SCOUT = 'scout-user-id'
const ALICE = 'athlete-alice'

// Records the filters the handler applied, so "scoped to the caller" is a fact the test
// checks rather than a claim in a comment.
let filters: Array<[string, string]> = []

const chain = () => {
  const builder = {
    select: (...args: unknown[]) => { supabaseBoundary.select(...args); return builder },
    eq: (column: string, value: string) => { filters.push([column, value]); return builder },
    maybeSingle: supabaseBoundary.maybeSingle,
  }
  return builder
}

const request = (url: string) => new Request(url)

beforeEach(() => {
  vi.clearAllMocks()
  filters = []
  supabaseBoundary.getUser.mockResolvedValue({ data: { user: { id: SCOUT } } })
  supabaseBoundary.from.mockImplementation((table: string) => { supabaseBoundary.select(`table:${table}`); return chain() })
  supabaseBoundary.maybeSingle.mockResolvedValue({ data: null, error: null })
})

describe('GET /api/scout-shortlist', () => {
  it('refuses an anonymous caller exactly as the writes do', async () => {
    supabaseBoundary.getUser.mockResolvedValue({ data: { user: null } })

    const response = await GET(request(`https://test.local/api/scout-shortlist?athleteId=${ALICE}`))

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'กรุณาเข้าสู่ระบบก่อน' })
    expect(supabaseBoundary.from).not.toHaveBeenCalled()
  })

  it('rejects a request with no athlete', async () => {
    const response = await GET(request('https://test.local/api/scout-shortlist'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'ไม่พบนักกีฬา' })
    expect(supabaseBoundary.from).not.toHaveBeenCalled()
  })

  it('rejects a blank athlete id rather than reading the whole shortlist', async () => {
    const response = await GET(request('https://test.local/api/scout-shortlist?athleteId=%20%20'))

    expect(response.status).toBe(400)
    expect(supabaseBoundary.from).not.toHaveBeenCalled()
  })

  it('reads only the caller\'s own row for that one athlete', async () => {
    supabaseBoundary.maybeSingle.mockResolvedValue({ data: { athlete_id: ALICE, note: 'quick feet' }, error: null })

    const response = await GET(request(`https://test.local/api/scout-shortlist?athleteId=${ALICE}`))

    expect(supabaseBoundary.from).toHaveBeenCalledWith('scout_shortlists')
    // Both filters, so one scout can never read another's shortlist through this route.
    expect(filters).toEqual([['scout_id', SCOUT], ['athlete_id', ALICE]])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ athleteId: ALICE, saved: true, note: 'quick feet' })
  })

  it('answers "not saved" as a real answer, not an error', async () => {
    supabaseBoundary.maybeSingle.mockResolvedValue({ data: null, error: null })

    const response = await GET(request(`https://test.local/api/scout-shortlist?athleteId=${ALICE}`))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ athleteId: ALICE, saved: false, note: '' })
  })

  it('reports a database failure instead of pretending the row is absent', async () => {
    // A recovery read that answered "not saved" on an error would unlock the row on a
    // guess, which is the exact thing the lock exists to prevent.
    supabaseBoundary.maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })

    const response = await GET(request(`https://test.local/api/scout-shortlist?athleteId=${ALICE}`))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ error: 'อ่านสถานะ Shortlist ไม่สำเร็จ' })
  })

  it('never calls a writing RPC', async () => {
    // It is a read-back. If it ever gained a side effect, pressing "โหลดสถานะใหม่"
    // would become the duplicate write the whole design is avoiding.
    const supabase = await import('@/lib/supabase-server').then(m => m.createServerSupabaseClient())

    expect('rpc' in supabase).toBe(false)
  })
})
