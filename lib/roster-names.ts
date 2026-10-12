// Names for roster rows. team_members.athlete_id references auth.users, not
// athlete_profiles, so PostgREST cannot embed athlete_profiles in a team_members query
// (PGRST200). The team's staff read names through team_roster_names (sql/76): display
// name and position of their own team's pending and accepted members, even when a
// profile is private (W1 finding F2). Before SQL76 the function is missing and the
// profiles are read directly, in batches of 100 ids; RLS then shows public ones only.
type RosterReader = {
  rpc: (fn: 'team_roster_names', args: { p_team_ids: string[] }) => PromiseLike<{ data: unknown; error: { code?: string } | null }>
  from: (table: 'athlete_profiles') => {
    select: (columns: string) => { in: (column: string, values: string[]) => PromiseLike<{ data: unknown; error: unknown }> }
  }
}
export type RosterProfile = { display_name: string | null; position: string | null }

const MISSING = ['PGRST202', '42883']

export async function rosterProfiles(client: RosterReader, athleteIds: string[], teamIds: string[] = []) {
  const ids = [...new Set(athleteIds)]
  const byId = new Map<string, RosterProfile>()
  if (ids.length === 0) return byId
  const teams = [...new Set(teamIds)].slice(0, 100)
  if (teams.length) {
    const { data, error } = await client.rpc('team_roster_names', { p_team_ids: teams })
    if (!error) {
      for (const row of (data ?? []) as ({ athlete_id: string } & RosterProfile)[]) byId.set(row.athlete_id, { display_name: row.display_name, position: row.position })
      return byId
    }
    if (!MISSING.includes(error.code ?? '')) return byId
  }
  for (let start = 0; start < ids.length; start += 100) {
    const { data } = await client.from('athlete_profiles').select('user_id, display_name, position').in('user_id', ids.slice(start, start + 100))
    for (const row of (data ?? []) as ({ user_id: string } & RosterProfile)[]) byId.set(row.user_id, { display_name: row.display_name, position: row.position })
  }
  return byId
}
