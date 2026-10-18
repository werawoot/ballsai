import { describe, expect, it } from 'vitest'
import { fetchMyTeamMemberships, teamNamesById } from '@/lib/my-team-memberships'

// QA on Production, 18 Oct 2026: an athlete who joined a team saw "ทีมของคุณ" because the
// embedded teams row is hidden by RLS. sql/82 returns the athlete's own team names.
function client({ rpc, rows = [] }: { rpc: { data: unknown; error: { code?: string } | null }; rows?: unknown[] }) {
  const calls: { rpc: unknown[]; from: unknown[] } = { rpc: [], from: [] }
  const reader = {
    rpc: (fn: string, args: unknown) => { calls.rpc.push([fn, args]); return Promise.resolve(rpc) },
    from: (table: string) => ({
      select: (columns: string) => ({
        eq: (column: string, value: string) => ({
          order: () => ({ limit: (count: number) => { calls.from.push([table, columns, column, value, count]); return Promise.resolve({ data: rows, error: null }) } }),
        }),
      }),
    }),
  }
  return { reader: reader as never, calls }
}

const row = { member_id: 'm1', team_id: 't1', status: 'accepted', invited_at: '2026-10-18T01:00:00Z', created_at: '2026-10-18T01:00:00Z', team_name: 'QA ทดสอบ 18ตค', team_status: 'draft', team_kind: 'club', tournament_name: null, tournament_location: null }

describe('the athlete reads their own teams with names', () => {
  it('uses my_team_memberships and keeps the team name', async () => {
    const { reader, calls } = client({ rpc: { data: [row], error: null } })
    const { memberships: [membership], failed } = await fetchMyTeamMemberships(reader, 'u1', 5)
    expect(failed).toBe(false)
    expect(calls.rpc).toEqual([['my_team_memberships', { p_limit: 5 }]])
    expect(calls.from).toEqual([])
    expect(membership).toMatchObject({ id: 'm1', team_id: 't1', status: 'accepted', teams: { id: 't1', name: 'QA ทดสอบ 18ตค', status: 'draft', kind: 'club', tournaments: null } })
  })
  it('keeps the tournament name and place when the team is in one', async () => {
    const { reader } = client({ rpc: { data: [{ ...row, tournament_name: 'Cup', tournament_location: 'Bangkok' }], error: null } })
    const { memberships: [membership] } = await fetchMyTeamMemberships(reader, 'u1')
    expect(membership.teams?.tournaments).toEqual({ name: 'Cup', location: 'Bangkok' })
  })
  it('caps the page size at 100 and at least 1', async () => {
    const big = client({ rpc: { data: [], error: null } })
    await fetchMyTeamMemberships(big.reader, 'u1', 5000)
    const small = client({ rpc: { data: [], error: null } })
    await fetchMyTeamMemberships(small.reader, 'u1', 0)
    expect(big.calls.rpc[0]).toEqual(['my_team_memberships', { p_limit: 100 }])
    expect(small.calls.rpc[0]).toEqual(['my_team_memberships', { p_limit: 1 }])
  })
  it('falls back to the old read of its own rows before SQL82', async () => {
    const { reader, calls } = client({ rpc: { data: null, error: { code: 'PGRST202' } }, rows: [{ id: 'm1', team_id: 't1', status: 'pending', invited_at: null, created_at: 'x', teams: null }] })
    const result = await fetchMyTeamMemberships(reader, 'u1', 12)
    expect(calls.from).toEqual([['team_members', 'id, team_id, status, invited_at, created_at, teams(id, name, status, tournaments(name, location))', 'athlete_id', 'u1', 12]])
    expect(result.failed).toBe(false)
    expect(result.memberships).toEqual([{ id: 'm1', team_id: 't1', status: 'pending', invited_at: null, created_at: 'x', teams: null }])
  })
  it('maps team ids to names for attestations and skill proposals', async () => {
    const { reader } = client({ rpc: { data: [row, { ...row, member_id: 'm2', team_id: 't2', team_name: 'liverpool' }], error: null } })
    const names = teamNamesById((await fetchMyTeamMemberships(reader, 'u1')).memberships)
    expect(names.get('t1')).toBe('QA ทดสอบ 18ตค')
    expect(names.get('t2')).toBe('liverpool')
  })
})
