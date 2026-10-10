// Assistant coaches (sql/75): what the app checks before asking the database, which
// checks the same again.

// A team has its head coach and at most this many assistants (pending or accepted).
export const STAFF_MAX = 3

// An email as invite_team_staff looks it up: trimmed, lower-case, one @, no spaces.
export function cleanStaffEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.trim().toLowerCase()
  return email.length >= 3 && email.length <= 254 && /^[^@\s]+@[^@\s]+$/.test(email) ? email : null
}

export type StaffRow = { id: string | null; user_id: string; name: string; email: string | null; status: 'pending' | 'accepted'; is_head: boolean; is_me: boolean }
export type MyStaffTeamRow = { staff_id: string; team_id: string; team_name: string; tournament_name: string | null; status: 'pending' | 'accepted'; head_name: string; invited_at: string }
export type MyTeamStaffRow = { team_id: string; team_name: string; name: string; is_head: boolean }

// The team's staff grouped per team, head coach first, for athletes and guardians.
export function staffByTeam(rows: MyTeamStaffRow[]) {
  const teams = new Map<string, { teamId: string; teamName: string; staff: { name: string; isHead: boolean }[] }>()
  for (const row of rows) {
    const team = teams.get(row.team_id) ?? { teamId: row.team_id, teamName: row.team_name, staff: [] }
    team.staff.push({ name: row.name, isHead: row.is_head })
    teams.set(row.team_id, team)
  }
  for (const team of teams.values()) team.staff.sort((a, b) => Number(b.isHead) - Number(a.isHead))
  return [...teams.values()]
}
