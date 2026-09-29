import { beforeEach, describe, expect, it, vi } from 'vitest'

// T32: a rank row created by a first verified match has no skill ratings. An admin must
// be able to correct its name or team without inventing PAC/SHO/PAS/DRI/DEF, so a skill
// may be left empty (null = not assessed); a value that is given must still be 0-100.
const rpc = vi.hoisted(() => vi.fn())
vi.mock('@/lib/admin-mutations', () => ({
  getAdminMutationContext: async () => ({ supabase: { rpc } }),
  auditedSchemaError: () => false,
}))

import { PATCH } from '@/app/api/admin/rankings/[rankId]/route'

const RANK = '8c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'
const base = { player_name: 'Fresh', team: 'A', province: 'Bangkok', position: 'FW', ovr: 60, pts: 1016, rank_change: 16 }
const save = (skills: Record<string, unknown>) =>
  PATCH(new Request(`http://localhost/api/admin/rankings/${RANK}`, { method: 'PATCH', body: JSON.stringify({ ...base, ...skills }) }), { params: Promise.resolve({ rankId: RANK }) })

beforeEach(() => { rpc.mockReset(); rpc.mockResolvedValue({ error: null }) })

describe('editing a rank row\'s skill ratings', () => {
  it('saves with skills left not assessed (null)', async () => {
    const response = await save({ pac: null, sho: null, pas: null, dri: null, def: null })
    expect(response.status).toBe(200)
    expect(rpc.mock.calls[0][1].p_payload).toMatchObject({ pac: null, def: null })
  })

  it('saves an assessment, and a mix of assessed and not yet assessed', async () => {
    expect((await save({ pac: 80, sho: 70, pas: 65, dri: 72, def: 40 })).status).toBe(200)
    expect((await save({ pac: 80, sho: null, pas: 65, dri: null, def: 40 })).status).toBe(200)
  })

  it('still refuses a skill outside 0-100 or not a whole number', async () => {
    for (const bad of [101, -1, 50.5, '70']) expect((await save({ pac: bad, sho: 1, pas: 1, dri: 1, def: 1 })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
  })
})
