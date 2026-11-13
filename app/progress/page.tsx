import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronRight, Dumbbell, Ruler } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { thaiDate } from '@/lib/athlete-private'
import { fetchTrainingHistory } from '@/lib/training/progress-data'
import { fetchMyGoal } from '@/lib/training/goal-data'
import { selfTestsEnabled } from '@/lib/training/self-tests'
import SelfTestSummaryList from '@/components/SelfTestSummaryList'
import { fetchSelfTestResults } from '@/lib/training/self-test-data'
import { progressView } from '@/lib/training/progress'
import { SESSIONS_PER_LEVEL, trainingLevel } from '@/lib/training/level'
import { dayStreak } from '@/lib/athlete-home'
import { say } from '@/lib/training/content'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import WeeksChart from '@/components/WeeksChart'
import '../glass.css'
import '../profile/profile.css'

// /progress, the athlete's Progress tab (ADR-015, owner 8 Nov 2026: training first). Only what
// the athlete recorded: sessions checked in, their minutes, effort points, days in a row, the
// last eight weeks and where each active programme stands. Every number is self-recorded
// (AGENTS.md rule 8) and the page says so. The self-tests (sql/96) have their own page,
// /progress/tests, linked here only while NEXT_PUBLIC_SELF_TESTS is "true".

export const dynamic = 'force-dynamic'

export default async function ProgressPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/progress')

  const showTests = selfTestsEnabled()
  const [t, tr, ts, locale, history, myGoal, tests] = await Promise.all([getTranslations('progressPage'), getTranslations('training'), getTranslations('selfTests'), getLocale(), fetchTrainingHistory(supabase, user.id), fetchMyGoal(supabase, user.id),
    showTests ? fetchSelfTestResults(supabase, user.id) : Promise.resolve({ ready: false, rows: [] })])
  const today = thaiDate(new Date())
  const view = progressView({ enrollments: history.enrollments, checkins: history.checkins, today })
  // Days in a row across every programme the athlete did not stop: a finished programme keeps
  // its run; a stopped one would count its unplanned remainder as missed days.
  const active = history.enrollments.filter(item => item.status !== 'stopped')
  const checkinMap: Record<string, string[]> = {}
  for (const row of history.checkins) (checkinMap[row.enrollment_id] ??= []).push(row.session_date)
  const streak = dayStreak({ available: history.available, enrollments: active, checkins: checkinMap }, today)
  const number = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-GB')
  const shortDate = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const hasHistory = view.sessions > 0
  const level = trainingLevel(view.effort)

  return (
    <main className="pf pf-progress gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.training)}>
      <PageHeader eyebrow={t('eyebrow')} />
      <div className="pf-shell pg-shell">
        <section className="pf-card" aria-labelledby="pg-title">
          <h1 id="pg-title" className="pf-card-title">{t('title')}</h1>
          <p className="pf-card-desc">{t('lead')}</p>
          {!history.available && <p className="pf-note" role="status">{tr('notReady')}</p>}
          {history.available && !history.complete && <p className="pf-note" role="alert">{t('incomplete')}</p>}
        </section>

        {/* The goal (ADR-015): what this progress is for, and the way to change it. */}
        {myGoal.available && <section className="pf-card" aria-labelledby="pg-goal">
          <h2 id="pg-goal" className="pf-card-title">{t('goal.title')}</h2>
          {myGoal.goal
            ? <p className="pg-goal-now"><span className="pf-chip is-green">{t('goal.current', { goal: tr(`goals.options.${myGoal.goal}.label`) })}</span><Link href="/training?tab=programs&goal=change">{t('goal.change')}</Link></p>
            : <><p className="pf-card-desc">{t('goal.none')}</p><Link href="/training?tab=programs" className="pf-btn pf-btn-ghost">{t('goal.set')}</Link></>}
        </section>}

        {/* The self-tests (owner, 10 Nov 2026), hidden until the coach sign-off. Their page says
            what to do when SQL96 is not applied yet or the person has no athlete profile. */}
        {showTests && <section className="pf-card" aria-labelledby="pg-tests">
          <h2 id="pg-tests" className="pf-card-title">{ts('card.title')}</h2>
          <p className="pf-card-desc">{ts('card.body')}</p>
          {tests.ready && tests.rows.length > 0 && <>
            <h3 className="pg-tests-sub">{ts('card.latestTitle')}</h3>
            <SelfTestSummaryList rows={tests.rows} today={today} t={ts} day={value => shortDate.format(new Date(`${value}T00:00:00Z`))} lower={amount => ts('lower', { amount })} historyLinks />
            <p className="pf-note">{ts('self')} · {ts('rules')}</p>
          </>}
          {!tests.ready && <p className="pf-note" role="status">{ts('notReady')}</p>}
          <Link href="/progress/tests" className="pf-btn pf-btn-ghost"><Ruler size={17} aria-hidden="true" />{ts('card.open')}</Link>
        </section>}

        {history.available && history.complete && !hasHistory && view.programmes.length === 0 && <section className="pf-card" aria-labelledby="pg-empty">
          <h2 id="pg-empty" className="pf-card-title">{t('empty.title')}</h2>
          <p className="pf-card-desc">{t('empty.body')}</p>
          <Link href="/training" className="pf-btn pf-btn-primary"><Dumbbell size={17} aria-hidden="true" />{t('empty.cta')}</Link>
        </section>}

        {history.available && history.complete && (hasHistory || view.programmes.length > 0) && <>
          {hasHistory && <section className="pf-card pf-lv pg-level" aria-labelledby="pg-level">
            <div className="pf-lv-row"><h2 id="pg-level" className="pf-card-title">{t('level.title', { level: level.level })}</h2><span>{t('level.points', { points: number.format(level.points), target: number.format(level.target) })}</span></div>
            <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.percent} aria-labelledby="pg-level"><i style={{ width: `${level.percent}%` }} /></div>
            <p className="pf-note">{t('level.next', { count: level.sessionsToNext, next: level.level + 1, per: SESSIONS_PER_LEVEL })}</p>
            <p className="pf-note">{t('selfNote')}</p>
          </section>}

          <section className="pf-card" aria-labelledby="pg-totals">
            <h2 id="pg-totals" className="pf-card-title">{t('totals.title')}</h2>
            <dl className="me-stats pg-stats">
              <div><dt>{t('totals.sessionsLabel')}</dt><dd>{t('totals.sessions', { count: number.format(view.sessions) })}</dd></div>
              <div><dt>{t('totals.minutesLabel')}</dt><dd>{t('totals.minutes', { count: number.format(view.minutes) })}</dd></div>
              <div><dt>{t('totals.effortLabel')}</dt><dd>{t('totals.effort', { count: number.format(view.effort) })}</dd></div>
              <div><dt>{t('totals.streakLabel')}</dt><dd>{t('totals.streak', { count: number.format(streak) })}</dd></div>
            </dl>
            <p className="pf-note">{t('selfNote')}</p>
          </section>

          <section className="pf-card" aria-labelledby="pg-weeks-title">
            <h2 id="pg-weeks-title" className="pf-card-title">{t('weeks.title')}</h2>
            <WeeksChart weeks={view.weeks} shortDate={shortDate} label={(date, count) => t('weeks.label', { date, count })} />
            <p className="pf-note">{t('selfNote')}</p>
          </section>

          <section className="pf-card" aria-labelledby="pg-programmes">
            <h2 id="pg-programmes" className="pf-card-title">{t('programmes.title')}</h2>
            {view.programmes.length === 0
              ? <><p className="pf-card-desc">{t('programmes.none')}</p><Link href="/training" className="pf-btn pf-btn-ghost"><Dumbbell size={17} aria-hidden="true" />{t('empty.cta')}</Link></>
              : <ul className="pf-list">
                {view.programmes.map(item => <li key={item.programId}>
                  <Link href={`/training/${item.programId}`} className="pf-list-main pg-programme">
                    <b>{say(item.program.title, locale)}</b>
                    <span>{item.progress.finished ? t('programmes.finished') : t('programmes.week', { week: item.progress.week, weeks: item.progress.weeks })} · {t('programmes.done', { done: item.progress.done, total: item.progress.total })}</span>
                    <span className="pf-bar" aria-hidden="true"><i style={{ width: `${Math.round(item.progress.done / Math.max(1, item.progress.total) * 100)}%` }} /></span>
                  </Link>
                  <ChevronRight size={17} aria-hidden="true" />
                </li>)}
              </ul>}
          </section>
        </>}
      </div>
    </main>
  )
}
