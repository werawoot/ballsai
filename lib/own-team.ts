// A coach's own team (sql/78, docs/coach-own-team-v1.md): shared shapes and tidying.

export const OWN_TEAM_MAX = 20
export const ENTRY_ROSTER_MAX = 60

// A team name as the database stores it: trimmed, inner spaces collapsed, 2-80 characters,
// no control characters. Anything else is null.
export function cleanTeamName(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const name = value.trim().replace(/\s+/g, ' ')
  return name.length >= 2 && name.length <= 80 && !/[\u0000-\u001f\u007f]/.test(name) ? name : null
}

// An entry's tournament roster as the caller and the children they guard see it (my_entry_rosters).
export type EntryRosterRow = {
  member_id: string
  team_id: string
  team_name: string
  tournament_name: string
  start_date: string | null
  athlete_id: string
  athlete_name: string | null
  status: 'accepted' | 'declined'
  can_withdraw: boolean
}
