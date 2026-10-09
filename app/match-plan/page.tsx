import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MatchPlanClient, { type MatchPlanTeam } from './MatchPlanClient'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { getTranslations } from 'next-intl/server'
import MatchPlanTeamFilter from './MatchPlanTeamFilter'
import { parsePage } from '@/lib/pagination'
import { fetchMatchPlanTeamsPage, type MatchPlanScope } from '@/lib/match-plan-teams'

export default async function MatchPlanPage(
  props: { searchParams?: Promise<{ scope?: string; page?: string; q?: string }> }
) {
  const tl = await getTranslations('labels')
  const searchParams = (await props.searchParams) ?? {}
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/match-plan')

  const { data: profile } = await supabase.from('profiles').select('role, onboarding_persona').eq('id', user.id).single()
  const canCoach = profile?.role === 'organizer' || profile?.role === 'admin' || profile?.onboarding_persona === 'coach_organizer'
  if (!canCoach) redirect('/')

  // The teams this user may plan for, filtered by the query itself one scope at a time and
  // paged; organizers and admins start on the teams in their own tournaments.
  const organizes = profile?.role === 'organizer' || profile?.role === 'admin'
  const scope: MatchPlanScope = searchParams.scope === 'mine' || searchParams.scope === 'organized' ? searchParams.scope : organizes ? 'organized' : 'mine'
  const page = parsePage(searchParams.page)
  const search = (searchParams.q ?? '').trim().slice(0, 80)
  const [t, { teams, hasNext }] = await Promise.all([
    getTranslations('matchPlan'),
    fetchMatchPlanTeamsPage(supabase, { userId: user.id, scope, page, search }),
  ])

  return (
    <main className="bds-page ui-matchday" style={{ minHeight: '100vh', paddingBottom: 24 }}>
      <PageHeader back={{ href: '/dashboard', label: tl('dashboardLabels.back') }} />

      <section className="mp-head">
        <p className="ui-eyebrow">{tl('matchPlanPage.eyebrow')}</p>
        <h1>{t('title')}</h1>
        <p>{t('lead')}</p>
      </section>

      <section style={{ maxWidth: 720, margin: '0 auto', padding: '6px 16px 22px' }}>
        {/* Team groups and search are for organizers, who see every team in their tournaments; a
            coach with only their own team or two goes straight to the board. */}
        {(organizes || search || hasNext || page > 1) && <MatchPlanTeamFilter scope={scope} search={search} showScopes={organizes} />}
        {search && teams.length === 0
          ? <p style={{ background: 'var(--ui-card)', border: '1px solid var(--ui-line)', borderRadius: 14, padding: 20, color: 'var(--ui-mute)', margin: 0 }}>{t('empty')}</p>
          // Keyed by the list shown, so a new scope, search or page starts on its first team.
          : <MatchPlanClient key={`${scope}:${search}:${page}`} teams={teams as unknown as MatchPlanTeam[]} />}
        <Pagination basePath="/match-plan" page={page} hasNext={hasNext} params={{ scope, q: search }} />
      </section>
    </main>
  )
}
