import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SiteNav from '@/components/SiteNav'
import { fetchUnreadNotificationCount } from '@/lib/notification-count'
import TeamMembersClient from './TeamMembersClient'
import CoachTeamOverview from './CoachTeamOverview'
import AthleteAttestationInbox from './AthleteAttestationInbox'
import {
  coachTeamOverview, latestAttestations,
  type AthleteAttestation, type AttestationRow, type CoachTeamRow, type RosterRow,
} from '@/lib/coach-team-overview'
import Link from 'next/link'
import { ClipboardPenLine } from 'lucide-react'

export default async function TeamMembersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/team-members')
  const unreadCount = await fetchUnreadNotificationCount(supabase, user.id)
  const [{ data: teams }, { data: invites }] = await Promise.all([
    supabase.from('teams').select('id, name, tournament_id, status, tournaments(name)').eq('created_by', user.id).order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, team_id, athlete_id, status, invited_at, teams(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
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
  return <main style={{ minHeight: '100vh', background: '#f7f7f7' }}><SiteNav unreadCount={unreadCount} /><div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 80px' }}><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 32, marginBottom: 8 }}>TEAM ROSTER</h1><p style={{ color: '#777', marginBottom: 14 }}>เชื่อมสมาชิกทีมกับบัญชีจริง เพื่อให้ผลแข่งและเส้นทางนักกีฬาถูกต้อง</p>{teams?.length ? <Link href="/match-plan" style={{ marginBottom: 20, background: '#101827', color: 'white', borderRadius: 10, padding: '11px 13px', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 800, textDecoration: 'none' }}><ClipboardPenLine size={16} color="#f5c518" /> วางแผนก่อนแข่ง</Link> : null}{attestationError
      ? <p role="alert" style={{ margin: '0 0 16px', padding: '9px 11px', borderRadius: 9, background: '#fff1f1', color: '#b91c1c', fontSize: 12, fontWeight: 700 }}>โหลดคำรับรองจากโค้ชไม่สำเร็จ กรุณาโหลดหน้าใหม่</p>
      : <AthleteAttestationInbox attestations={attestations} />}
    <CoachTeamOverview teams={overview} rosterError={Boolean(rosterError)} attestations={attestationState} attestationError={Boolean(coachAttestationError)} /><TeamMembersClient teams={teams ?? []} invites={(invites ?? []) as never[]} /></div></main>
}
