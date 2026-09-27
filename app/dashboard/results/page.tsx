import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import MatchResultForm from './MatchResultForm'
import MatchResultHistory from './MatchResultHistory'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import PageHeader from '@/components/PageHeader'

type TournamentOption = {
  id: string
  name: string
  organizer_id: string
}

type TeamOption = {
  id: string
  name: string
  tournament_id: string
  status: string
}

type PlayerOption = {
  id: string
  player_id: string | null
  player_name: string
  position: string
  pts: number
  teamId: string
}

type MatchResultRow = {
  id: string
  tournament_id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  status: string
  created_at: string
}

export default async function MatchResultsPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'organizer' && profile?.role !== 'admin') redirect('/')

  let tournamentsQuery = supabase
    .from('tournaments')
    .select('id, name, organizer_id')
    .order('created_at', { ascending: false })

  if (profile?.role !== 'admin') {
    tournamentsQuery = tournamentsQuery.eq('organizer_id', user.id)
  }

  const { data: tournaments } = await tournamentsQuery
  const tournamentIds = tournaments?.map(tournament => tournament.id) ?? []

  // Every team of the organizer's tournaments is loaded, not only confirmed ones,
  // so a recorded result can still show its team names if a team changes status
  // afterwards. Only confirmed teams are selectable in the form.
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, tournament_id, status')
    .in('tournament_id', tournamentIds.length > 0 ? tournamentIds : ['none'])
    .order('name')

  const allTeams = (teams ?? []) as TeamOption[]
  const confirmedTeams = allTeams.filter(team => team.status === 'confirmed')

  const { data: acceptedMembers } = await supabase
    .from('team_members')
    .select('team_id, athlete_id')
    .in('team_id', confirmedTeams.length > 0 ? confirmedTeams.map(team => team.id) : ['none'])
    .eq('status', 'accepted')

  const acceptedAthleteIds = [...new Set((acceptedMembers ?? []).map(member => member.athlete_id))]
  const { data: players } = await supabase
    .from('player_ranks')
    .select('id, player_id, player_name, position, pts')
    .eq('sport', ACTIVE_SPORT)
    .eq('season', ACTIVE_SEASON)
    .in('player_id', acceptedAthleteIds.length > 0 ? acceptedAthleteIds : ['none'])
    .order('player_name')

  const { data: matchResults } = await supabase
    .from('match_results')
    .select('id, tournament_id, team_a_id, team_b_id, team_a_score, team_b_score, status, created_at')
    .in('tournament_id', tournamentIds.length > 0 ? tournamentIds : ['none'])
    .order('created_at', { ascending: false })
    .limit(20)

  const teamNames = Object.fromEntries(allTeams.map(team => [team.id, team.name]))
  const teamIdByAthlete = new Map((acceptedMembers ?? []).map(member => [member.athlete_id, member.team_id]))
  const rosterPlayers = ((players ?? []) as Omit<PlayerOption, 'teamId'>[])
    .map(player => ({ ...player, teamId: player.player_id ? teamIdByAthlete.get(player.player_id) ?? '' : '' }))
    .filter(player => player.teamId)
  const tournamentNames = Object.fromEntries((tournaments ?? []).map(tournament => [tournament.id, tournament.name]))

  return (
    <main className="bds-page" style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40, overflowX: 'hidden' }}>
      <PageHeader back={{ href: '/dashboard', label: 'Dashboard' }} />

      <div className="bds-hero" style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            MATCH<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>RESULT</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>บันทึกผลแข่งและอัปเดต Power Rating</p>
        </div>
      </div>

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <MatchResultForm
        tournaments={(tournaments ?? []) as TournamentOption[]}
        teams={confirmedTeams}
        players={rosterPlayers}
      />

      <div style={{ padding: '0 16px' }}>
        <MatchResultHistory
          matchResults={(matchResults ?? []) as MatchResultRow[]}
          teamNames={teamNames}
          tournamentNames={tournamentNames}
        />
      </div>
    </main>
  )
}
