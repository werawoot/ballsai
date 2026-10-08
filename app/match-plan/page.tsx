import { ClipboardPenLine } from 'lucide-react'
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
    <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 56 }}>
      <PageHeader back={{ href: '/dashboard', label: 'Dashboard' }} />

      <section style={{ background: 'linear-gradient(118deg,#101827 0%,#203047 60%,#8d1014 140%)', color: 'white', padding: '34px 18px 41px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .15, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 20px, white 20px 21px)' }} />
        <div style={{ maxWidth: 850, margin: '0 auto', position: 'relative' }}>
          <p style={{ color: '#f5c518', margin: 0, font: '800 11px var(--font-oswald)', letterSpacing: 1.4 }}>{tl('matchPlanPage.eyebrow')}</p>
          <h1 style={{ margin: '9px 0 6px', font: '800 clamp(38px,8vw,68px)/.88 var(--font-oswald)', letterSpacing: -.5 }}>{tl('matchPlanPage.titleLine1')}<br /><span style={{ color: '#f5c518' }}>{tl('matchPlanPage.titleLine2')}</span></h1>
          <p style={{ margin: 0, maxWidth: 510, color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 1.55 }}>{tl('matchPlanPage.intro')}</p>
        </div>
      </section>

      <section style={{ maxWidth: 850, margin: '0 auto', padding: '22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#394150', marginBottom: 14, fontSize: 12, fontWeight: 700 }}><ClipboardPenLine size={16} color="#CC0001" /> เลือกได้เฉพาะสมาชิกที่ตอบรับคำเชิญเข้าทีมแล้ว</div>
        <MatchPlanTeamFilter scope={scope} search={search} />
        {search && teams.length === 0
          ? <p style={{ background: '#fff', border: '1px solid #e0e4ea', borderRadius: 14, padding: 20, color: '#627084', margin: 0 }}>{t('empty')}</p>
          // Keyed by the list shown, so a new scope, search or page starts on its first team.
          : <MatchPlanClient key={`${scope}:${search}:${page}`} teams={teams as unknown as MatchPlanTeam[]} />}
        <Pagination basePath="/match-plan" page={page} hasNext={hasNext} params={{ scope, q: search }} />
      </section>
    </main>
  )
}
