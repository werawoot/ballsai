import { describe, expect, it } from 'vitest'
import { fetchMyTeamHub } from '@/lib/my-team-hub'

// T59: /team-members called ten "my_..." functions one after another. my_team_hub (sql/92)
// answers them in one call.
type Answer = { data: unknown; error: { code?: string } | null }

function fakeSupabase(answers: Record<string, Answer>) {
  const calls: string[] = []
  const rpc = async (fn: string, args?: Record<string, unknown>) => {
    calls.push(args ? `${fn}(${Object.values(args).join(',')})` : fn)
    return answers[fn] ?? { data: null, error: { code: 'PGRST202' } }
  }
  return { client: { rpc } as never, calls }
}

const membership = { member_id: 'm1', team_id: 't1', status: 'accepted', invited_at: null, created_at: '2026-10-18T00:00:00Z', team_name: 'Tigers U13', team_status: 'confirmed', team_kind: 'club', tournament_name: null, tournament_location: null }
const event = { event_id: 'e1', team_id: 't1', team_name: 'Tigers U13', kind: 'training', title: 'Practice', starts_at: '2026-10-25T09:00:00Z', location: null, note: null, athlete_id: 'u1', athlete_name: 'Nong A', answer: null }
const lists = {
  entries: [{ member_id: 'x1', team_name: 'Cup team' }], events: [event], child_teams: [{ member_id: 'c1' }],
  news: [{ id: 'n1' }], plans: [{ team_id: 't1' }], notes: [{ id: 'note1' }], minutes: [{ team_id: 't1' }],
  staff_teams: [{ team_id: 't2' }], team_staff: [{ team_id: 't1' }],
}

describe("the person's own team hub data", () => {
  it('comes from my_team_hub in one call, in the shape the page uses', async () => {
    const { client, calls } = fakeSupabase({ my_team_hub: { data: { ...lists, memberships: [membership] }, error: null } })
    const hub = await fetchMyTeamHub(client)
    expect(calls).toEqual(['my_team_hub'])
    expect(hub.failed).toBe(false)
    expect(hub.memberships[0]).toMatchObject({ id: 'm1', status: 'accepted', teams: { name: 'Tigers U13' } })
    expect(hub.events).toEqual([event])
    expect([hub.entries, hub.childTeams, hub.news, hub.plans, hub.notes, hub.minutes, hub.staffTeams, hub.teamStaff].map(list => list.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1])
  })

  // SQL92 is on Staging and Production (23 Oct 2026): a missing function is a failure the page
  // shows, not a reason to send ten more calls.
  it('reports a failure without more calls when my_team_hub is missing', async () => {
    const { client, calls } = fakeSupabase({})
    const hub = await fetchMyTeamHub(client)
    expect(calls).toEqual(['my_team_hub'])
    expect(hub.failed).toBe(true)
    expect(hub.memberships).toEqual([])
  })

  // A timeout is not "the function is missing": ten more calls would only add to the load.
  it('reports a failure without ten more calls when my_team_hub fails for another reason', async () => {
    const { client, calls } = fakeSupabase({ my_team_hub: { data: null, error: { code: '57014' } } })
    const hub = await fetchMyTeamHub(client)
    expect(calls).toEqual(['my_team_hub'])
    expect(hub.failed).toBe(true)
    expect(hub.memberships).toEqual([])
  })
})
