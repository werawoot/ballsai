import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@supabase/ssr'
import GuardianLinksClient, { type GuardianLink } from './GuardianLinksClient'
import MyEventsPanel, { type MyEventRow } from '../team-members/MyEventsPanel'
import MyNewsPanel, { type MyAnnouncementRow } from '../team-members/MyNewsPanel'
import MyTrainingPanel, { type MyPlanRow } from '../team-members/MyTrainingPanel'
import MyCoachNotesPanel, { type MyNoteRow } from '../team-members/MyCoachNotesPanel'
import MyMinutesPanel, { type MyMinutesRow } from '../team-members/MyMinutesPanel'
import { planToday } from '@/lib/team-training'
import Link from 'next/link'
import PageHeader from '@/components/PageHeader'
import { CHANGE_ROLE_PATH } from '@/lib/onboarding'

type Profile = { onboarding_persona: string | null }
type LinkRow = {
  id: string
  status: GuardianLink['status']
  requested_at: string
  athlete_profiles: {
    display_name: string
    is_public: boolean
    athlete_progress: { xp_total: number; current_level: number }[] | null
    athlete_badges: { badge_key: string }[] | null
  } | null
}

function mapLink(row: LinkRow, fallbackName: string): GuardianLink {
  const athlete = row.athlete_profiles
  return {
    id: row.id,
    status: row.status,
    requested_at: row.requested_at,
    athlete: athlete ? {
      display_name: athlete.display_name || fallbackName,
      is_public: athlete.is_public,
      progress: athlete.athlete_progress?.[0] ?? null,
      badge_count: athlete.athlete_badges?.length ?? 0,
    } : null,
  }
}

export default async function GuardianPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/guardian')
  const t = await getTranslations('header')
  const tp = await getTranslations('guardianPage')

  const [{ data: profile }, { data: guardianRows }, { data: incomingRows }] = await Promise.all([
    supabase.from('profiles').select('onboarding_persona').eq('id', user.id).maybeSingle(),
    supabase.from('guardian_links').select('id, status, requested_at, athlete_profiles!guardian_links_athlete_id_fkey(display_name, is_public, athlete_progress(xp_total, current_level), athlete_badges(badge_key))').eq('guardian_id', user.id).order('requested_at', { ascending: false }),
    supabase.from('guardian_links').select('id, status, requested_at').eq('athlete_id', user.id).eq('status', 'pending').order('requested_at', { ascending: false }),
  ])
  // Upcoming team events of the children this guardian may answer for (sql/70). Before
  // SQL70 the function is missing and nothing is shown.
  const { data: eventRows, error: eventsError } = await supabase.rpc('my_upcoming_team_events', { p_limit: 30 })
  const events = eventsError ? [] : ((eventRows ?? []) as MyEventRow[])
  // Announcements from their children's teams (sql/71); nothing before SQL71.
  const { data: newsRows, error: newsError } = await supabase.rpc('my_team_announcements', { p_limit: 10 })
  const news = newsError ? [] : ((newsRows ?? []) as MyAnnouncementRow[])
  // This week's and next week's plans of their children's teams (sql/72).
  const { data: planRows, error: plansError } = await supabase.rpc('my_team_training_plans')
  const plans = plansError ? [] : ((planRows ?? []) as MyPlanRow[])
  const planDay = planToday()
  // Coach notes about the athlete or the children this guardian may act for (sql/73).
  const { data: noteRows, error: notesError } = await supabase.rpc('my_coach_notes', { p_limit: 50 })
  const coachNotes = notesError ? [] : ((noteRows ?? []) as MyNoteRow[])
  // Season minutes recorded by the coach (sql/74); nothing before SQL74.
  const { data: minuteRows, error: minutesError } = await supabase.rpc('my_match_minutes')
  const myMinutes = minutesError ? [] : ((minuteRows ?? []) as MyMinutesRow[])
  const isGuardian = (profile as Profile | null)?.onboarding_persona === 'guardian'
  const links = ((guardianRows ?? []) as unknown as LinkRow[]).map(row => mapLink(row, tp('athleteFallback')))
  const incoming = ((incomingRows ?? []) as unknown as LinkRow[]).map(row => mapLink(row, tp('athleteFallback')))

  return <main className="bds-page ui-matchday" style={{ minHeight: '100vh', paddingBottom: 48 }}>
    <PageHeader back={{ href: '/profile', label: t('back.profile') }} />
    <section style={{ background: '#101827', color: 'white', padding: '30px 18px 34px' }}><div style={{ maxWidth: 720, margin: '0 auto' }}><h1 style={{ fontSize: 'clamp(28px,7vw,40px)', lineHeight: 1.2, margin: '0 0 9px', fontWeight: 800 }}>{tp('title')}</h1><p style={{ maxWidth: 480, color: 'rgba(255,255,255,.7)', fontSize: 15, lineHeight: 1.55, margin: 0 }}>{tp('sub')}</p></div></section>
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      {!isGuardian && incoming.length === 0 && <div style={{ background: 'var(--ui-card)', border: '1px solid #f4d98b', borderRadius: 12, padding: 14, color: '#624a00', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>
        <p style={{ margin: '0 0 12px' }}>{tp('notGuardian.body')}</p>
        <Link href={CHANGE_ROLE_PATH} style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', borderRadius: 12, background: '#CC0001', color: 'white', fontWeight: 800, fontSize: 15, textDecoration: 'none' }}>{tp('notGuardian.changeRole')}</Link>
      </div>}
      <MyNewsPanel rows={news} />
      <MyCoachNotesPanel rows={coachNotes} viewerId={user.id} />
      <MyMinutesPanel rows={myMinutes} viewerId={user.id} />
      <MyTrainingPanel rows={plans} thisWeek={planDay.thisWeek} today={planDay.today} />
      <MyEventsPanel rows={events} viewerId={user.id} />
      <GuardianLinksClient isGuardian={isGuardian} links={links} incoming={incoming} />
    </section>
  </main>
}
