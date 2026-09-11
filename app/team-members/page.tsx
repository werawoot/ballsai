import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SiteNav from '@/components/SiteNav'
import TeamMembersClient from './TeamMembersClient'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'

export default async function TeamMembersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/team-members')

  // invite_team_member accepts the team's creator OR the organizer of its tournament
  // (sql/24-team-roster-integrity-v1.sql). Loading only created_by teams left an
  // organizer with nothing to invite for, since teams are registered by athletes.
  const [{ data: ownTournaments }, { data: createdTeams }, { data: invites }] = await Promise.all([
    supabase.from('tournaments').select('id').eq('organizer_id', user.id),
    supabase.from('teams').select('id, name, tournament_id').eq('created_by', user.id).order('created_at', { ascending: false }),
    supabase.from('team_members').select('id, team_id, athlete_id, status, direction, invited_at, teams(name)').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])

  const tournamentIds = (ownTournaments ?? []).map(tournament => tournament.id)
  const { data: organizedTeams } = tournamentIds.length > 0
    ? await supabase.from('teams').select('id, name, tournament_id').in('tournament_id', tournamentIds).order('name')
    : { data: [] }

  const manageable = [...(createdTeams ?? []), ...(organizedTeams ?? [])]
  const teams = [...new Map(manageable.map(team => [team.id, team])).values()]

  // Current roster for those teams, so an organizer can confirm who accepted before
  // recording a match. Names come from player_ranks (public read) — never from
  // profiles, which would expose contact data this page has no reason to show.
  const teamIds = teams.map(team => team.id)
  const { data: members } = teamIds.length > 0
    ? await supabase.from('team_members').select('id, team_id, athlete_id, status, direction, invited_at, responded_at').in('team_id', teamIds).order('created_at', { ascending: false })
    : { data: [] }

  const athleteIds = [...new Set((members ?? []).map(member => member.athlete_id))]
  const { data: ranks } = athleteIds.length > 0
    ? await supabase.from('player_ranks').select('player_id, player_name').in('player_id', athleteIds).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON)
    : { data: [] }
  const nameByAthlete = Object.fromEntries((ranks ?? []).flatMap(rank => rank.player_id ? [[rank.player_id, rank.player_name]] : []))

  // Discovery and invite labels both go through read-only security-definer functions:
  // `teams` SELECT is closed to non-owners on purpose, so a direct query here returns
  // nothing for the athletes these two features exist for. See sql/25-team-discovery-v1.sql.
  // Both degrade to an empty list until that file is applied; the API route explains why.
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

  return <main style={{ minHeight: '100vh', background: '#f7f7f7' }}><SiteNav /><div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 16px 80px' }}><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 32, marginBottom: 8 }}>TEAM ROSTER</h1><p style={{ color: '#777', marginBottom: 20 }}>เชื่อมสมาชิกทีมกับบัญชีจริง เพื่อให้ผลแข่งและเส้นทางนักกีฬาถูกต้อง</p><TeamMembersClient teams={teams} invites={(invites ?? []) as never[]} members={(members ?? []) as never[]} joinableTeams={joinableTeams} teamLabels={teamLabels} nameByAthlete={nameByAthlete} /></div></main>
}
