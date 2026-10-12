// Names for roster rows. team_members.athlete_id references auth.users, not
// athlete_profiles, so PostgREST cannot embed athlete_profiles in a team_members query
// (PGRST200). Read the profiles in a second query instead, in batches of 100 ids so the
// URL stays short. RLS decides which profiles come back, as an embed would have.
type ProfileReader = {
  from: (table: 'athlete_profiles') => {
    select: (columns: string) => { in: (column: string, values: string[]) => PromiseLike<{ data: unknown; error: unknown }> }
  }
}
export type RosterProfile = { display_name: string | null; position: string | null }

export async function rosterProfiles(client: ProfileReader, athleteIds: string[]) {
  const ids = [...new Set(athleteIds)]
  const byId = new Map<string, RosterProfile>()
  for (let start = 0; start < ids.length; start += 100) {
    const { data } = await client.from('athlete_profiles').select('user_id, display_name, position').in('user_id', ids.slice(start, start + 100))
    for (const row of (data ?? []) as ({ user_id: string } & RosterProfile)[]) byId.set(row.user_id, { display_name: row.display_name, position: row.position })
  }
  return byId
}
