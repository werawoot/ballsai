import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import TeamMembersClient from './TeamMembersClient'
import CoachTeamOverview from './CoachTeamOverview'
import AthleteAttestationInbox from './AthleteAttestationInbox'
import {
  coachTeamOverview, latestAttestations,
  type AthleteAttestation, type AttestationRow, type CoachTeamRow, type RosterRow,
} from '@/lib/coach-team-overview'
import Link from 'next/link'
import { ClipboardPenLine } from 'lucide-react'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'

export default async function TeamMembersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/team-members')
  const [{ data: teams }, { data: invites }] = await Promise.all([
    supabase.from('teams').select('id, name, tournament_id, status, tournaments(name)').eq('created_by', user.id).order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, team_id, athlete_id, status, direction, invited_at, teams(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])
  // The roster of the teams this account created, which is a different question from
  // the invitations this account received. RLS scopes both; the team ids are only ever
  // the ones the query above already returned.
  const teamIds = (teams ?? []).map(team => team.id)
  const { data: roster, error: rosterError } = teamIds.length
    ? await supabase.from('team_members')
      .select('id, team_id, athlete_id, status, invited_at, athlete_profiles(display_name)')
      .in('team_id', teamIds)
      .order('invited_at', { ascending: true })
    : { data: [], error: null }
  const overview = coachTeamOverview(
    (teams ?? []) as unknown as CoachTeamRow[],
    (roster ?? []) as unknown as RosterRow[],
  )

  // The athlete's own pending and answered attestations. A failure here is surfaced
  // too, rather than silently hiding a request that is waiting on them.
  // No join from coach_id: PostgREST needs a proven, RLS-safe relationship for that,
  // and a coach's name, email or phone is not the athlete's to read. The team is the
  // identifier the athlete already knows, because they accepted its invitation.
  const { data: attestationRows, error: attestationError } = await supabase
    .from('coach_attestations')
    .select('id, field, claimed_value, status, created_at, teams(name)')
    .eq('athlete_id', user.id)
    .order('created_at', { ascending: false })
  const attestations = (attestationRows ?? []).map(row => ({
    id: row.id as string,
    teamName: (row.teams as { name?: string } | null)?.name ?? '',
    field: 'playing_position',
    claimedValue: row.claimed_value,
    status: row.status,
    createdAt: row.created_at,
  })) as unknown as AthleteAttestation[]

  // The coach's own view: the newest attestation state for each of their members, so
  // the form can refuse a duplicate before it is posted.
  const { data: coachAttestationRows, error: coachAttestationError } = teamIds.length
    ? await supabase.from('coach_attestations')
      .select('id, team_id, athlete_id, field, claimed_value, status, created_at')
      .in('team_id', teamIds)
      .order('created_at', { ascending: true })
    : { data: [], error: null }
  const attestationState = latestAttestations(coachAttestationRows as AttestationRow[] | null)
  // Beta: invite_team_member and remove_team_member accept the organizer of the team's
  // tournament as well as its creator (sql/24-team-roster-integrity-v1.sql), and teams
  // are registered by athletes, so an organizer loading only created_by teams had nothing
  // to manage. The coach overview above stays on the creator's own teams: its removal
  // (manage_coach_beta) is creator-only.
  const { data: ownTournaments } = await supabase.from('tournaments').select('id').eq('organizer_id', user.id)
  const tournamentIds = (ownTournaments ?? []).map(tournament => tournament.id)
  const { data: organizedTeams } = tournamentIds.length > 0
    ? await supabase.from('teams').select('id, name, tournament_id, status, tournaments(name)').in('tournament_id', tournamentIds).order('name')
    : { data: [] }
  type ManagedTeam = NonNullable<typeof teams>[number] & { managedAs: 'creator' | 'organizer' }
  const manageable = new Map<string, ManagedTeam>()
  for (const team of organizedTeams ?? []) manageable.set(team.id, { ...team, managedAs: 'organizer' })
  // Set last, so a team this account both created and organizes is treated as its own.
  for (const team of teams ?? []) manageable.set(team.id, { ...team, managedAs: 'creator' })
  const manageableTeams = [...manageable.values()]

  const manageableIds = manageableTeams.map(team => team.id)
  const { data: members } = manageableIds.length > 0
    ? await supabase.from('team_members').select('id, team_id, athlete_id, status, direction, invited_at, responded_at').in('team_id', manageableIds).order('created_at', { ascending: false })
    : { data: [] }

  // Names from player_ranks (public read) -- never from profiles, which would expose
  // contact data this page has no reason to show.
  const athleteIds = [...new Set((members ?? []).map(member => member.athlete_id))]
  const { data: ranks } = athleteIds.length > 0
    ? await supabase.from('player_ranks').select('player_id, player_name').in('player_id', athleteIds).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON)
    : { data: [] }
  const nameByAthlete = Object.fromEntries((ranks ?? []).flatMap(rank => rank.player_id ? [[rank.player_id, rank.player_name]] : []))

  // Discovery and invite labels go through read-only security-definer functions: `teams`
  // SELECT is closed to non-owners on purpose (sql/25-team-discovery-v1.sql). Both degrade
  // to an empty list until that file is applied.
  const [{ data: joinable }, { data: labels }] = await Promise.all([
    supabase.rpc('list_joinable_teams'),
    supabase.rpc('list_my_team_labels'),
  ])
  const joinableTeams = ((joinable ?? []) as Array<{ team_id: string; team_name: string; tournament_name: string }>)
    .map(team => ({ id: team.team_id, name: `${team.team_name} · ${team.tournament_name}` }))
  const teamLabels = Object.fromEntries(
    ((labels ?? []) as Array<{ team_id: string; team_name: string; tournament_name: string }>)
      .map(team => [team.team_id, `${team.team_name} · ${team.tournament_name}`]),
  )
  return <main style={{ minHeight: '100vh', background: '#f7f7f7' }}><div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 80px' }}><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 32, marginBottom: 8 }}>TEAM ROSTER</h1><p style={{ color: '#777', marginBottom: 14 }}>เชื่อมสมาชิกทีมกับบัญชีจริง เพื่อให้ผลแข่งและเส้นทางนักกีฬาถูกต้อง</p>{teams?.length ? <Link href="/match-plan" style={{ marginBottom: 20, background: '#101827', color: 'white', borderRadius: 10, padding: '11px 13px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}><ClipboardPenLine size={16} color="#f5c518" /> วางแผนก่อนแข่ง</Link> : null}{attestationError
      ? <p role="alert" style={{ margin: '0 0 16px', padding: '9px 11px', borderRadius: 9, background: '#fff1f1', color: '#b91c1c', fontSize: 12, fontWeight: 700 }}>โหลดคำรับรองจากโค้ชไม่สำเร็จ กรุณาโหลดหน้าใหม่</p>
      : <AthleteAttestationInbox attestations={attestations} />}
    <CoachTeamOverview teams={overview} rosterError={Boolean(rosterError)} attestations={attestationState} attestationError={Boolean(coachAttestationError)} /><TeamMembersClient teams={manageableTeams as never[]} invites={(invites ?? []) as never[]} members={(members ?? []) as never[]} joinableTeams={joinableTeams} teamLabels={teamLabels} nameByAthlete={nameByAthlete} /></div></main>
}
