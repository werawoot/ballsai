import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import MatchResultForm from './MatchResultForm'
import MatchResultHistory from './MatchResultHistory'
import TournamentPicker from './TournamentPicker'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import PageHeader from '@/components/PageHeader'
import { parsePage } from '@/lib/pagination'
import { RESULT_HISTORY_LIMIT, fetchResultTournamentData, fetchResultTournamentsPage } from '@/lib/match-results-dashboard'

export default async function MatchResultsPage(
  props: { searchParams?: Promise<{ tournament?: string; page?: string; q?: string }> }
) {
  const searchParams = (await props.searchParams) ?? {}
  const cookieStore = await cookies()
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

  // One tournament at a time: the picker pages (and searches) the tournaments this user
  // may record for, and only the chosen one's teams, rosters and history are loaded. An
  // admin chooses from every tournament in the country.
  const isAdmin = profile?.role === 'admin'
  const page = parsePage(searchParams.page)
  const search = (searchParams.q ?? '').trim().slice(0, 80)
  const t = await getTranslations('matchResults')
  const picker = await fetchResultTournamentsPage(supabase, { userId: user.id, isAdmin, page, search })
  // Without a choice, the newest tournament is selected, as the form always did.
  const selectedId = searchParams.tournament || picker.tournaments[0]?.id || ''
  const data = selectedId
    ? await fetchResultTournamentData(supabase, { tournamentId: selectedId, userId: user.id, isAdmin, sport: ACTIVE_SPORT, season: ACTIVE_SEASON })
    : null
  const teamNames = Object.fromEntries((data?.teams ?? []).map(team => [team.id, team.name]))
  const tournamentNames = data ? { [data.tournament.id]: data.tournament.name } : {}

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

      <div style={{ padding: '16px 16px 0' }}>
        <TournamentPicker tournaments={picker.tournaments} selectedId={selectedId} page={page} hasNext={picker.hasNext} search={search} />
      </div>

      {selectedId && !data && (
        <p role="alert" style={{ margin: '14px 16px 0', background: '#fff0f0', borderLeft: '3px solid #d71920', color: '#9b1d27', fontSize: 13, padding: '10px 12px' }}>{t('notFound')}</p>
      )}

      {data && <>
        <p style={{ margin: '14px 16px 0', fontSize: 12, color: '#666' }}>{t('selected')} <b style={{ color: '#111' }}>{data.tournament.name}</b></p>
        {/* Keyed by tournament, so choosing another one starts the form afresh. */}
        <MatchResultForm
          key={data.tournament.id}
          tournaments={[data.tournament]}
          teams={data.confirmedTeams}
          players={data.rosterPlayers}
        />

        <div style={{ padding: '0 16px' }}>
          <MatchResultHistory
            matchResults={data.matchResults}
            teamNames={teamNames}
            tournamentNames={tournamentNames}
          />
          {data.matchResults.length >= RESULT_HISTORY_LIMIT && (
            <p style={{ fontSize: 11, color: '#888', marginTop: 8 }}>{t('history', { count: RESULT_HISTORY_LIMIT })}</p>
          )}
        </div>
      </>}
    </main>
  )
}
