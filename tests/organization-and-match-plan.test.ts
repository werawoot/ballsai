import { describe, expect, it } from 'vitest'
import { ORGANIZATIONS_PAGE_SIZE, fetchMyOrganizationsPage } from '@/lib/organization-desk'
import { MATCH_PLAN_TEAMS_PAGE_SIZE, fetchMatchPlanTeamsPage } from '@/lib/match-plan-teams'

type Row = Record<string, unknown>
type Call = { table: string; filters: string[]; orders: string[]; inSizes: number[]; head: boolean; range?: [number, number] }
const get = (row: Row, path: string) => path.split('.').reduce<unknown>((value, key) => (value as Row | undefined)?.[key], row)

// A stand-in for PostgREST that, unlike the real database here, applies NO row-level
// security: whatever the code does not filter for itself comes back. That is the point
// of T47 -- the query, not RLS, must decide whose rows these are.
function fakeSupabase(tables: Record<string, Row[]>) {
  const calls: Call[] = []
  const from = (table: string) => {
    const call: Call = { table, filters: [], orders: [], inSizes: [], head: false }
    calls.push(call)
    let rows = tables[table] ?? []
    const builder = {
      select: (_columns: string, options?: { head?: boolean }) => { call.head = Boolean(options?.head); return builder },
      eq: (column: string, value: unknown) => { call.filters.push(`${column}=${value}`); rows = rows.filter(row => get(row, column) === value); return builder },
      in: (column: string, values: unknown[]) => { call.inSizes.push(values.length); rows = rows.filter(row => values.includes(get(row, column))); return builder },
      ilike: (column: string, value: string) => { call.filters.push(`${column}~${value}`); const needle = value.replace(/%/g, '').toLowerCase(); rows = rows.filter(row => String(get(row, column)).toLowerCase().includes(needle)); return builder },
      order: (column: string, options?: { ascending?: boolean }) => { call.orders.push(`${column} ${options?.ascending === false ? 'desc' : 'asc'}`); return builder },
      range: (start: number, end: number) => { call.range = [start, end]; return builder },
      then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(call.head
        ? { data: null, count: rows.length, error: null }
        : { data: call.range ? rows.slice(call.range[0], call.range[1] + 1) : rows, error: null }).then(resolve, reject),
    }
    return builder
  }
  return { client: { from }, calls }
}

const ME = 'user-1'

describe('/organization lists my organizations, one page at a time', () => {
  const orgs = Array.from({ length: 14 }, (_, index) => ({ id: `org-${index + 1}`, name: `Academy ${index + 1}`, kind: 'academy', province: 'เชียงใหม่', description: '' }))
  const members = [
    ...orgs.map((org, index) => ({ id: `m-${index}`, organization_id: org.id, user_id: ME, role: index === 0 ? 'owner' : 'coach', status: 'accepted', organizations: org })),
    { id: 'm-pending', organization_id: 'org-x', user_id: ME, role: 'athlete', status: 'pending', organizations: { id: 'org-x', name: 'Invited Only' } },
    { id: 'm-other', organization_id: 'org-y', user_id: 'user-2', role: 'owner', status: 'accepted', organizations: { id: 'org-y', name: 'Someone Else' } },
    // 300 accepted athletes in the first academy: counted, never loaded.
    ...Array.from({ length: 300 }, (_, index) => ({ id: `a-${index}`, organization_id: 'org-1', user_id: `athlete-${index}`, role: 'athlete', status: 'accepted' })),
  ]

  it('shows only organizations I have accepted, paged, however many exist', async () => {
    const { client } = fakeSupabase({ organization_members: members })
    const first = await fetchMyOrganizationsPage(client as never, { userId: ME, page: 1 })
    const second = await fetchMyOrganizationsPage(client as never, { userId: ME, page: 2 })
    expect(ORGANIZATIONS_PAGE_SIZE).toBe(10)
    expect(first.organizations).toHaveLength(10)
    expect(first.hasNext).toBe(true)
    expect(second.organizations.map(org => org.id)).toEqual(['org-11', 'org-12', 'org-13', 'org-14'])
    expect(second.hasNext).toBe(false)
    const names = [...first.organizations, ...second.organizations].map(org => org.name)
    expect(names).not.toContain('Invited Only')
    expect(names).not.toContain('Someone Else')
  })

  it('counts accepted members in the database instead of loading them', async () => {
    const { client, calls } = fakeSupabase({ organization_members: members })
    const { organizations } = await fetchMyOrganizationsPage(client as never, { userId: ME, page: 1 })
    expect(organizations[0]).toMatchObject({ id: 'org-1', role: 'owner', memberCount: 301 })
    expect(organizations[1]).toMatchObject({ id: 'org-2', role: 'coach', memberCount: 1 })
    const loads = calls.filter(call => !call.head)
    expect(loads).toHaveLength(1)
    expect(loads[0].filters).toEqual(expect.arrayContaining([`user_id=${ME}`, 'status=accepted']))
    expect(loads[0].orders).toEqual(['invited_at desc', 'id asc'])
    for (const call of calls.filter(item => item.head)) expect(call.filters).toContain('status=accepted')
  })
})

describe('/match-plan lists teams I may plan for, one page at a time', () => {
  const tournament = (id: string, organizer: string) => ({ name: `Cup ${id}`, start_date: '2026-11-01', organizer_id: organizer })
  const teams = [
    ...Array.from({ length: 12 }, (_, index) => ({ id: `mine-${index + 1}`, name: `My Team ${index + 1}`, created_by: ME, tournaments: tournament('x', 'org-9') })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `entered-${index + 1}`, name: `Entered ${index + 1}`, created_by: 'coach-2', tournaments: tournament('mine', ME) })),
    { id: 'stranger', name: 'Stranger FC', created_by: 'coach-3', tournaments: tournament('other', 'org-9') },
  ]

  it('"mine" is the teams I created, paged and searchable', async () => {
    const { client, calls } = fakeSupabase({ teams })
    const first = await fetchMatchPlanTeamsPage(client as never, { userId: ME, scope: 'mine', page: 1 })
    expect(MATCH_PLAN_TEAMS_PAGE_SIZE).toBe(10)
    expect(first.teams).toHaveLength(10)
    expect(first.hasNext).toBe(true)
    const found = await fetchMatchPlanTeamsPage(client as never, { userId: ME, scope: 'mine', page: 1, search: 'Team 12' })
    expect(found.teams.map(team => team.id)).toEqual(['mine-12'])
    expect(calls[0].orders).toEqual(['created_at desc', 'id asc'])
  })

  it('"organized" is the teams entered in tournaments I run', async () => {
    const { client } = fakeSupabase({ teams })
    const result = await fetchMatchPlanTeamsPage(client as never, { userId: ME, scope: 'organized', page: 1 })
    expect(result.teams.map(team => team.id)).toEqual(['entered-1', 'entered-2', 'entered-3'])
  })

  it('always filters by the user in the query, never leaving it to row-level security', async () => {
    const { client, calls } = fakeSupabase({ teams })
    for (const scope of ['mine', 'organized'] as const) {
      const result = await fetchMatchPlanTeamsPage(client as never, { userId: ME, scope, page: 1 })
      expect(result.teams.map(team => team.id)).not.toContain('stranger')
    }
    for (const call of calls) expect(call.filters.some(filter => filter === `created_by=${ME}` || filter === `tournaments.organizer_id=${ME}`)).toBe(true)
  })
})
