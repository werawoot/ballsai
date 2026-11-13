import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { thaiDate } from '@/lib/athlete-private'
import { dayStreak } from '@/lib/athlete-home'
import { fetchAcceptedChild } from '@/lib/guardian-child'
import { fetchTrainingHistory } from '@/lib/training/progress-data'
import { fetchGoalOf } from '@/lib/training/goal-data'
import { fetchSelfTestResults } from '@/lib/training/self-test-data'
import { progressView } from '@/lib/training/progress'
import { say } from '@/lib/training/content'
import { selfTestsEnabled } from '@/lib/training/self-tests'
import SelfTestSummaryList from '@/components/SelfTestSummaryList'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import WeeksChart from '@/components/WeeksChart'
import '../../../glass.css'
import '../../../profile/profile.css'

// /guardian/[athleteId]/progress: what an accepted guardian may see of their child's own training
// (owner, 12 Nov 2026): home sessions, the goal, programmes and, while NEXT_PUBLIC_SELF_TESTS is
// "true", the self-test results. Read only: nothing here writes. Everything is self-recorded by
// the child (AGENTS.md rule 8), and the page says so. Anyone who is not an accepted guardian of
// this athlete gets a 404, whatever the id.

export const dynamic = 'force-dynamic'

export default async function GuardianChildProgressPage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/guardian/${athleteId}/progress`)}`)
  const child = await fetchAcceptedChild(supabase, user.id, athleteId)
  if (!child) notFound()

  const showTests = selfTestsEnabled()
  const [t, tp, tr, ts, locale, history, goal, tests] = await Promise.all([
    getTranslations('guardianProgress'), getTranslations('progressPage'), getTranslations('training'), getTranslations('selfTests'), getLocale(),
    fetchTrainingHistory(supabase, child.athleteId), fetchGoalOf(supabase, child.athleteId),
    showTests ? fetchSelfTestResults(supabase, child.athleteId) : Promise.resolve({ ready: false, rows: [] }),
  ])
  const today = thaiDate(new Date())
  const view = progressView({ enrollments: history.enrollments, checkins: history.checkins, today })
  const checkinMap: Record<string, string[]> = {}
  for (const row of history.checkins) (checkinMap[row.enrollment_id] ??= []).push(row.session_date)
  const streak = dayStreak({ available: history.available, enrollments: history.enrollments.filter(item => item.status !== 'stopped'), checkins: checkinMap }, today)
  const number = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-GB')
  const shortDate = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const longDate = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const day = (value: string) => longDate.format(new Date(`${value}T00:00:00Z`))
  const name = child.displayName ?? t('childFallback')

  return (
    <main className="pf pf-progress gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.training)}>
      <PageHeader eyebrow={t('eyebrow')} back={{ href: '/guardian', label: t('back') }} />
      <div className="pf-shell pg-shell">
        <section className="pf-card" aria-labelledby="gp-title">
          <h1 id="gp-title" className="pf-card-title">{t('title', { name })}</h1>
          <p className="pf-card-desc">{t('lead')}</p>
          <p className="pf-note">{t('selfNote')}</p>
          {!history.available && <p className="pf-note" role="status">{t('notReady')}</p>}
          {history.available && !history.complete && <p className="pf-note" role="alert">{tp('incomplete')}</p>}
        </section>

        <section className="pf-card" aria-labelledby="gp-goal">
          <h2 id="gp-goal" className="pf-card-title">{t('goalTitle')}</h2>
          <p className="pf-card-desc">{!goal.available ? t('notReady') : goal.goal ? <span className="pf-chip is-green">{tr(`goals.options.${goal.goal}.label`)}</span> : t('noGoal')}</p>
        </section>

        {history.available && history.complete && <>
          <section className="pf-card" aria-labelledby="gp-totals">
            <h2 id="gp-totals" className="pf-card-title">{t('totalsTitle')}</h2>
            {view.sessions === 0
              ? <p className="pf-card-desc">{t('noSessions')}</p>
              : <dl className="me-stats pg-stats">
                <div><dt>{tp('totals.sessionsLabel')}</dt><dd>{tp('totals.sessions', { count: number.format(view.sessions) })}</dd></div>
                <div><dt>{tp('totals.minutesLabel')}</dt><dd>{tp('totals.minutes', { count: number.format(view.minutes) })}</dd></div>
                <div><dt>{tp('totals.streakLabel')}</dt><dd>{tp('totals.streak', { count: number.format(streak) })}</dd></div>
              </dl>}
          </section>

          {view.sessions > 0 && <section className="pf-card" aria-labelledby="gp-weeks">
            <h2 id="gp-weeks" className="pf-card-title">{tp('weeks.title')}</h2>
            <WeeksChart weeks={view.weeks} shortDate={shortDate} label={(date, count) => tp('weeks.label', { date, count })} />
          </section>}

          <section className="pf-card" aria-labelledby="gp-programmes">
            <h2 id="gp-programmes" className="pf-card-title">{tp('programmes.title')}</h2>
            {view.programmes.length === 0
              ? <p className="pf-card-desc">{tp('programmes.none')}</p>
              : <ul className="pf-list">
                {view.programmes.map(item => <li key={item.programId}>
                  <div className="pf-list-main pg-programme">
                    <b>{say(item.program.title, locale)}</b>
                    <span>{item.progress.finished ? tp('programmes.finished') : tp('programmes.week', { week: item.progress.week, weeks: item.progress.weeks })} · {tp('programmes.done', { done: item.progress.done, total: item.progress.total })}</span>
                    <span className="pf-bar" aria-hidden="true"><i style={{ width: `${Math.round(item.progress.done / Math.max(1, item.progress.total) * 100)}%` }} /></span>
                  </div>
                </li>)}
              </ul>}
          </section>
        </>}

        {showTests && <section className="pf-card" aria-labelledby="gp-tests">
          <h2 id="gp-tests" className="pf-card-title">{ts('card.title')}</h2>
          <p><span className="pf-chip">{ts('draft')}</span></p>
          {!tests.ready
            ? <p className="pf-note" role="status">{ts('notReady')}</p>
            : <SelfTestSummaryList rows={tests.rows} today={today} t={ts} day={day} lower={amount => t('lower', { amount })} />}
          <p className="pf-note">{t('testsNote')}</p>
        </section>}
      </div>
    </main>
  )
}
