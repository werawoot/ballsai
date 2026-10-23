import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MatchPlanClient, { type MatchPlanTeam } from './MatchPlanClient'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { getTranslations } from 'next-intl/server'
import MatchPlanTeamFilter from './MatchPlanTeamFilter'
import { parsePage } from '@/lib/pagination'
import { fetchMatchPlanTeamsPage, type MatchPlanScope } from '@/lib/match-plan-teams'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'

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
  const [t, th, { teams, hasNext }] = await Promise.all([
    getTranslations('matchPlan'),
    getTranslations('teamHub'),
    fetchMatchPlanTeamsPage(supabase, { userId: user.id, scope, page, search }),
  ])
  // Where this plan sits: an organizer came from the dashboard, a coach from their team hub.
  const crumb = organizes ? { href: '/dashboard', label: tl('dashboardLabels.back') } : { href: '/team-members', label: t('crumbTeam') }

  return (
    <main className="bds-page mp-page gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.matchPlan)}>
      {/* An organizer came from the dashboard; a coach from their own home (report 10). */}
      <PageHeader back={organizes ? { href: '/dashboard', label: tl('dashboardLabels.back') } : { href: '/profile', label: th('back') }} />

      {/* Keyed by the list shown, so a new scope, search or page starts on its first team. */}
      <MatchPlanClient key={`${scope}:${search}:${page}`} teams={teams as unknown as MatchPlanTeam[]} empty={Boolean(search) && teams.length === 0}
        head={<>
          <nav className="mp-crumb" aria-label={t('crumbLabel')}><Link href={crumb.href}>{crumb.label}</Link><ChevronRight size={16} aria-hidden="true" /><span>{t('crumbHere')}</span></nav>
          <h1>{t('heroTitle')}</h1>
          <p>{t('heroLead')}</p>
        </>}
        // Team groups and search are for organizers, who see every team in their tournaments; a
        // coach with only their own team or two goes straight to the board.
        toolbar={(organizes || search || hasNext || page > 1) ? <MatchPlanTeamFilter scope={scope} search={search} showScopes={organizes} /> : null}
        emptyText={t('empty')}
        pagination={<Pagination basePath="/match-plan" page={page} hasNext={hasNext} params={{ scope, q: search }} />}
      />
    </main>
  )
}
