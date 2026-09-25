// The coach's view of a team they created. Coach capability is the team-creator
// relationship, so this model never reads a profiles.role: what it can offer is
// derived from the team's own lifecycle state.

export type RosterStatus = 'pending' | 'accepted' | 'declined' | 'removed'

// The single field a coach may confirm, and the only values it may take. Wording is
// deliberately narrow: a coach confirms where the athlete plays, and nothing else.
export const COACH_VERIFIED_FIELD_LABEL = 'ตำแหน่งการเล่น'

export const POSITION_LABELS = {
  GK: 'ผู้รักษาประตู',
  DF: 'กองหลัง',
  MF: 'กองกลาง',
  FW: 'กองหน้า',
} as const

export type PlayingPosition = keyof typeof POSITION_LABELS

export type AthleteAttestation = {
  id: string
  teamName: string
  field: 'playing_position'
  claimedValue: PlayingPosition
  status: 'pending' | 'accepted' | 'declined'
  createdAt: string
}

export type CoachTeamRow = {
  id: string
  name: string
  status: string
  tournament_id: string | null
  tournaments: { name: string } | null
}

export type RosterRow = {
  id: string
  team_id: string
  athlete_id: string
  status: string
  invited_at: string
  athlete_profiles: { display_name: string } | null
}

export type CoachTeamView = {
  id: string
  name: string
  status: string
  tournamentName: string | null
  members: { id: string; athleteId: string; name: string; status: RosterStatus; invitedAt: string }[]
  counts: Record<RosterStatus, number>
  canManageRoster: boolean
  nextAction: string
  organizerOnly: string[]
}

// Named so the UI can state plainly what a coach cannot do, instead of showing a
// control that would be refused. Recording results stays with the tournament owner.
const ORGANIZER_ONLY = [
  'บันทึกผลการแข่งขันและยืนยันผล',
  'อนุมัติทีมเข้ารายการและตรวจสลิป',
]

export function coachTeamOverview(teams: CoachTeamRow[], roster: RosterRow[]): CoachTeamView[] {
  return teams.map(team => {
    const rows = roster.filter(row => row.team_id === team.id)
    const counts: Record<RosterStatus, number> = { pending: 0, accepted: 0, declined: 0, removed: 0 }
    for (const row of rows) {
      if (row.status in counts) counts[row.status as RosterStatus] += 1
    }
    // A removed member stays in the counts as history but leaves the active roster.
    const members = rows
      .filter(row => row.status !== 'removed')
      .map(row => ({
        id: row.id,
        athleteId: row.athlete_id,
        name: row.athlete_profiles?.display_name ?? 'นักกีฬา',
        status: row.status as RosterStatus,
        invitedAt: row.invited_at,
      }))

    const canManageRoster = team.status === 'draft'
    return {
      id: team.id,
      name: team.name,
      status: team.status,
      tournamentName: team.tournaments?.name ?? null,
      members,
      counts,
      canManageRoster,
      nextAction: nextAction(canManageRoster, counts),
      organizerOnly: ORGANIZER_ONLY,
    }
  })
}

function nextAction(canManageRoster: boolean, counts: Record<RosterStatus, number>) {
  if (!canManageRoster) return 'ส่งรายชื่อแล้ว รอผู้จัดรายการตรวจและยืนยันทีม'
  if (counts.accepted === 0 && counts.pending === 0) return 'เชิญสมาชิกคนแรกเข้าทีม'
  if (counts.pending > 0) return `รอนักกีฬาตอบรับคำเชิญ ${counts.pending} คน`
  return 'ส่งรายชื่อทีมให้ผู้จัดรายการ'
}

// --- Coach attestation state -------------------------------------------------------

export type AttestationRow = {
  id: string
  team_id: string
  athlete_id: string
  field: string
  claimed_value: string
  status: string
  created_at: string
}

export type AttestationState = {
  id: string
  status: 'pending' | 'accepted' | 'declined'
  claimedValue: string
  createdAt: string
}

// PostgREST cannot join profiles from coach_id without a proven, RLS-safe foreign-key
// relationship, and a coach's name, email or phone is not the athlete's to read. For
// closed beta the coach is identified by the team they run, which the athlete already
// knows because they accepted its invitation.
export function coachTeamLabel(teamName: string | null | undefined) {
  const name = teamName?.trim()
  return name ? `โค้ชของทีม ${name}` : 'โค้ชของทีม'
}

// A team has exactly one attesting coach: the account that created it. One athlete can
// still be on two teams, each with its own creator, so state must be keyed by the team
// as well -- otherwise an accepted attestation on one team would block and mislabel the
// form on the other.
export function attestationKey(teamId: string, athleteId: string, field: string) {
  return `${teamId}|${athleteId}|${field}`
}

// The newest attestation per (team, athlete, field). The coach needs the current state,
// not history; the full trail lives in coach_attestations and coach_verified_fields.
export function latestAttestations(rows: AttestationRow[] | null | undefined) {
  const latest: Record<string, AttestationState> = {}
  for (const row of rows ?? []) {
    const key = attestationKey(row.team_id, row.athlete_id, row.field)
    const current = latest[key]
    if (current && current.createdAt >= row.created_at) continue
    latest[key] = {
      id: row.id,
      status: row.status as AttestationState['status'],
      claimedValue: row.claimed_value,
      createdAt: row.created_at,
    }
  }
  return latest
}

export type AttestationGate = {
  canSubmit: boolean
  state: 'none' | 'pending' | 'accepted' | 'declined'
  reason: string | null
}

// Decides whether the coach may submit, so the form never posts a request SQL47 would
// refuse with a unique-index violation or a closed-attestation error.
export function attestationGate(
  memberStatus: RosterStatus,
  latest: AttestationState | undefined,
): AttestationGate {
  if (memberStatus !== 'accepted') {
    return { canSubmit: false, state: 'none', reason: 'รับรองได้เฉพาะสมาชิกที่ตอบรับคำเชิญแล้ว' }
  }
  if (!latest) return { canSubmit: true, state: 'none', reason: null }
  if (latest.status === 'pending') {
    return { canSubmit: false, state: 'pending', reason: 'ส่งคำรับรองแล้ว รอนักกีฬาตอบ' }
  }
  if (latest.status === 'accepted') {
    // No replacement flow is defined for closed beta. Say so instead of letting the
    // coach submit something the database will refuse.
    return { canSubmit: false, state: 'accepted', reason: 'นักกีฬารับรองแล้ว แก้ไขตำแหน่งที่รับรองยังไม่เปิดใช้ในรอบ Closed Beta' }
  }
  return { canSubmit: true, state: 'declined', reason: 'นักกีฬาปฏิเสธคำรับรองก่อนหน้า ส่งใหม่ได้' }
}

// Removing someone who accepted undoes a decision they made. Ask first; an unanswered
// or declined invitation carries no such decision.
export function removeNeedsConfirmation(memberStatus: RosterStatus) {
  return memberStatus === 'accepted'
}
