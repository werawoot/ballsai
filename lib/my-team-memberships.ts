// The signed-in athlete's own team memberships, with the team's name. The teams policy lets
// only a team's creator, the tournament organizer and an admin read a team row, so an
// embedded teams(...) read from team_members came back empty for the athlete and every page
// said "your team" instead of its name (QA on Production, 18 Oct 2026). my_team_memberships
// (sql/82) returns just the name, status and kind of the athlete's own teams and the
// tournament's name and place. Before SQL82 the function is missing and the old embedded
// read is used, which RLS answers with no team (the pages fall back to a generic label).
export type MyTeamMembership = {
  id: string
  team_id: string
  status: 'pending' | 'accepted' | 'declined' | 'removed'
  invited_at: string | null
  created_at: string
  teams: { id: string; name: string; status: string; kind: string | null; tournaments: { name: string | null; location: string | null } | null } | null
}

export type MembershipRow = {
  member_id: string; team_id: string; status: MyTeamMembership['status']; invited_at: string | null; created_at: string
  team_name: string; team_status: string; team_kind: string | null; tournament_name: string | null; tournament_location: string | null
}
type EmbeddedRow = Omit<MyTeamMembership, 'teams'> & {
  teams: { id: string; name: string; status: string; kind?: string | null; tournaments: { name: string | null; location: string | null } | { name: string | null; location: string | null }[] | null } | null
}
type MembershipReader = {
  rpc: (fn: 'my_team_memberships', args: { p_limit: number }) => PromiseLike<{ data: unknown; error: { code?: string } | null }>
  from: (table: 'team_members') => {
    select: (columns: string) => { eq: (column: string, value: string) => { order: (column: string, options: { ascending: boolean }) => { limit: (count: number) => PromiseLike<{ data: unknown; error: unknown }> } } }
  }
}

const MISSING = ['PGRST202', '42883']

// One row of my_team_memberships (sql/82), also embedded in my_profile_home (sql/91).
export function membershipFromRow(row: MembershipRow): MyTeamMembership {
  return {
    id: row.member_id,
    team_id: row.team_id,
    status: row.status,
    invited_at: row.invited_at,
    created_at: row.created_at,
    teams: { id: row.team_id, name: row.team_name, status: row.team_status, kind: row.team_kind, tournaments: row.tournament_name || row.tournament_location ? { name: row.tournament_name, location: row.tournament_location } : null },
  }
}
export const MY_TEAM_MEMBERSHIPS_LIMIT = 100

// failed: neither read answered, so the page can say it could not load rather than "no teams".
export async function fetchMyTeamMemberships(client: MembershipReader, userId: string, limit = 50): Promise<{ memberships: MyTeamMembership[]; failed: boolean }> {
  const capped = Math.min(Math.max(1, Math.floor(limit)), MY_TEAM_MEMBERSHIPS_LIMIT)
  const { data, error } = await client.rpc('my_team_memberships', { p_limit: capped })
  if (!error) {
    return { memberships: ((data ?? []) as MembershipRow[]).map(membershipFromRow), failed: false }
  }
  if (!MISSING.includes(error.code ?? '')) {
    console.error(JSON.stringify({ level: 'error', event: 'my_team_memberships_failed', code: error.code ?? null }))
  }
  const { data: rows, error: readError } = await client.from('team_members')
    .select('id, team_id, status, invited_at, created_at, teams(id, name, status, tournaments(name, location))')
    .eq('athlete_id', userId)
    .order('created_at', { ascending: false })
    .limit(capped)
  const memberships = ((rows ?? []) as EmbeddedRow[]).map(row => {
    const tournaments = Array.isArray(row.teams?.tournaments) ? row.teams.tournaments[0] ?? null : row.teams?.tournaments ?? null
    return { ...row, teams: row.teams ? { ...row.teams, kind: row.teams.kind ?? null, tournaments } : null }
  })
  return { memberships, failed: Boolean(readError) }
}

// Team names by id, for rows that only carry a team_id (attestations, skill proposals).
export function teamNamesById(memberships: MyTeamMembership[]) {
  return new Map(memberships.flatMap(row => (row.teams?.name ? [[row.team_id, row.teams.name] as const] : [])))
}
