import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildRosterPlayers, offersReasonedRemoval } from '@/lib/team-roster'

// Merge 2111890 ("sync staging branch with main for network testing") resolved ten
// conflicted files by taking main's side whole. Where both branches had built the same
// feature, that silently dropped beta's version; where only beta had it (approving a join
// request, removing a member after the roster locks), the feature disappeared. These tests
// hold the re-merge: both sides' behaviour, and the network-error handling layered on top.

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')

describe('match-result roster: an athlete on two confirmed teams', () => {
  const memberships = [
    { team_id: 'team-a', athlete_id: 'athlete-1' },
    { team_id: 'team-b', athlete_id: 'athlete-1' },
  ]
  const ranked = [{ id: 'rank-1', player_id: 'athlete-1', player_name: 'Somchai', position: 'MF', pts: 1200 }]

  it('stays selectable for both teams (beta)', () => {
    const roster = buildRosterPlayers(memberships, ranked)

    expect(roster.map(player => player.team_id).sort()).toEqual(['team-a', 'team-b'])
    expect(roster.every(player => player.id === 'rank-1')).toBe(true)
  })

  it('is what the page now uses, instead of the map that kept only the last team', () => {
    // The shape main shipped: one team per athlete, whichever membership came last.
    const lastTeamWins = new Map(memberships.map(member => [member.athlete_id, member.team_id]))
    expect(lastTeamWins.get('athlete-1')).toBe('team-b')

    const page = read('app/dashboard/results/page.tsx')
    expect(page).toContain('buildRosterPlayers(acceptedMembers ?? [], (players ?? []) as RankedAthlete[])')
    expect(page).not.toContain('new Map((acceptedMembers ?? []).map(member => [member.athlete_id, member.team_id]))')
  })

  it('gives each option a key that is unique once one rank can appear under two teams', () => {
    expect(read('app/dashboard/results/MatchResultForm.tsx')).toContain('<option key={`${player.teamId}:${player.id}`} value={player.id}>')
  })
})

describe('match-result API: one roster check, from both branches', () => {
  const route = read('app/api/match-results/route.ts')

  it('queries the roster exactly once', () => {
    expect(route.match(/from\('team_members'\)/g)?.length).toBe(1)
    expect(route).not.toContain('outsideRoster')
  })

  it('uses the shared rule the database mirrors', () => {
    expect(route).toContain("import { acceptedRosterKeys, rosterMismatches } from '@/lib/team-roster'")
    expect(route).toContain('rosterMismatches(performances, typedPlayerRanks, accepted)')
  })

  it('reports a failed roster lookup as an outage, not as "not a member"', () => {
    expect(route).toContain("event: 'match_result_roster_lookup_failed'")
    expect(route).toMatch(/ตรวจสอบรายชื่อสมาชิกทีมไม่สำเร็จ[^\n]*status: 503/)
  })

  it('translates the RPC\'s own roster rejection into words an organizer can act on', () => {
    expect(route).toContain("matchResultError?.message.includes('ATHLETE_NOT_ON_TEAM_ROSTER')")
    expect(route).toContain("matchResultError?.message.includes('PLAYER_RANK_NOT_LINKED_TO_ACCOUNT')")
  })
})

describe('match-result form: beta fixes on top of main + network handling', () => {
  const form = read('app/dashboard/results/MatchResultForm.tsx')

  it('no longer offers a team "filter" that typed the team name into a search that ignores it', () => {
    expect(form).not.toContain('setPlayerQuery(team.name)')
  })

  it('limits the list to the two teams actually playing', () => {
    expect(form).toContain('const selectedRoster = players.filter(player => selectedTeamIds.includes(player.teamId))')
  })

  it('keeps the unknown-outcome lock from the network work intact', () => {
    expect(form).toContain('shouldStartMatchResultAction')
    expect(form).toContain('outcomeUnknownRef.current = true')
    expect(form).toContain('window.location.reload()')
  })
})

describe('removing a member: one way, never zero, never two', () => {
  it.each([
    [{ status: 'draft', managedAs: 'creator' as const }, false, "creator of a draft team -> main's coach removal handles it"],
    [{ status: 'pending', managedAs: 'creator' as const }, true, 'creator after submitting -> coach removal refuses (ROSTER_LOCKED)'],
    [{ status: 'confirmed', managedAs: 'creator' as const }, true, 'creator of a confirmed team -> reasoned removal'],
    [{ status: 'draft', managedAs: 'organizer' as const }, true, 'organizer -> coach removal refuses (NOT_ALLOWED)'],
    [{ status: 'confirmed', managedAs: 'organizer' as const }, true, 'organizer of a confirmed team -> reasoned removal'],
  ])('%o -> %s (%s)', (team, expected) => {
    expect(offersReasonedRemoval(team)).toBe(expected)
  })

  it('offers nothing when no team is selected', () => {
    expect(offersReasonedRemoval(null)).toBe(false)
    expect(offersReasonedRemoval(undefined)).toBe(false)
  })
})

describe('team page: beta roster features restored on main\'s page', () => {
  const client = read('app/team-members/TeamMembersClient.tsx')
  const page = read('app/team-members/page.tsx')

  it('approves, declines and removes through the restored route actions', () => {
    expect(client).toContain("JSON.stringify({ action })")
    expect(client).toContain("JSON.stringify({ action: 'remove', reason })")
    expect(client).toContain('offersReasonedRemoval(selected)')
  })

  it('sends every new request down the network-safe path, never a raw fetch', () => {
    expect(client).not.toMatch(/\bfetch\(/)
    for (const fn of ['const decide = async', 'const remove = async', 'const requestJoin = async']) {
      const body = client.slice(client.indexOf(fn), client.indexOf('} finally { finish() }', client.indexOf(fn)))
      expect(body, fn).toContain('requestJson(')
      expect(body, fn).toContain('showFailure(outcome,')
    }
  })

  it('does not let an organizer submit a team someone else created', () => {
    expect(client).toContain("selected?.status === 'draft' && selected.managedAs !== 'organizer'")
  })

  it('tells an athlete\'s own request apart from an invitation, and never offers to accept it', () => {
    expect(client).toContain("invite.direction === 'request' && invite.status === 'pending' ? 'คำขอของคุณ รอผู้จัดทีมอนุมัติ'")
    expect(client).toContain("invite.status === 'pending' && invite.direction !== 'request' &&")
  })

  it('feeds the client beta\'s data while the coach overview keeps main\'s', () => {
    expect(page).toContain('members={(members ?? []) as never[]} joinableTeams={joinableTeams} teamLabels={teamLabels} nameByAthlete={nameByAthlete}')
    expect(page).toContain("supabase.rpc('list_joinable_teams')")
    expect(page).toContain('<CoachTeamOverview teams={overview}')
  })

  it('reads the new names from player_ranks, not from profiles', () => {
    const namesQuery = page.slice(page.indexOf('const { data: ranks }'), page.indexOf('const nameByAthlete'))
    expect(namesQuery).toContain("from('player_ranks')")
    expect(namesQuery).not.toContain('profiles')
  })
})

describe('restored routes keep main\'s callers working', () => {
  it('still accepts the status-only body main\'s client sends', () => {
    // parseAction treats a missing action as 'respond'; scripts/team-member-actions.test.mjs
    // exercises it, this pins that the route kept the default.
    expect(read('app/api/team-members/[memberId]/route.ts')).toContain("if (value === undefined || value === null) return 'respond'")
  })

  it('throttles invitations again, so the endpoint cannot be used to probe which emails have accounts', () => {
    expect(read('app/api/teams/[teamId]/members/route.ts')).toContain("checkRateLimit(request, { scope: 'team-invite', limit: 10, windowSeconds: 10 * 60 })")
  })
})
