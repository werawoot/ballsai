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
    <main className="bds-page mr-page">
      <PageHeader back={{ href: '/dashboard', label: 'Dashboard' }} />

      <div className="mr-head">
        <p className="ui-eyebrow">{t('eyebrow')}</p>
        <h1>{t('title')}</h1>
      </div>

      <div className="mr-picker">
        {/* Once a tournament is chosen the picker folds into one line, so the first screen is the match itself. */}
        <details className="mr-pick" open={!data}>
          <summary>
            {data ? <span className="mr-pick-line">{t('selected')} <b>{data.tournament.name}</b></span> : <span>{t('pickerTitle')}</span>}
            <span className="mr-pick-change">{t('change')}</span>
          </summary>
          <TournamentPicker tournaments={picker.tournaments} selectedId={selectedId} page={page} hasNext={picker.hasNext} search={search} />
        </details>
      </div>

      {selectedId && !data && (
        <p role="alert" style={{ margin: '14px 16px 0', background: '#fff0f0', borderLeft: '3px solid #d71920', color: '#9b1d27', fontSize: 13, padding: '10px 12px' }}>{t('notFound')}</p>
      )}

      {data && <>
        {data.unrecordableCount > 0 && <p role="note" style={{ margin: '8px 16px 0', fontSize: 12, color: '#8a5a12', background: '#fff6db', borderRadius: 8, padding: '8px 10px' }}>{t('unrecordable', { count: data.unrecordableCount })}</p>}
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
