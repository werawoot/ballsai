import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronRight, Dumbbell } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { fetchTrainingHistory } from '@/lib/training/progress-data'
import { progressView } from '@/lib/training/progress'
import { trainingLevel } from '@/lib/training/level'
import { dayStreak } from '@/lib/athlete-home'
import { say } from '@/lib/training/content'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import '../profile/profile.css'

// /progress, the athlete's Progress tab (ADR-015, owner 8 Nov 2026: training first). Only what
// the athlete recorded: sessions checked in, their minutes, effort points, days in a row, the
// last eight weeks and where each active programme stands. Every number is self-recorded
// (AGENTS.md rule 8) and the page says so. Self-test results join here later (ADR-015 item 5).

export const dynamic = 'force-dynamic'

const bangkokToday = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10)

export default async function ProgressPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/progress')

  const [t, tr, locale, history] = await Promise.all([getTranslations('progressPage'), getTranslations('training'), getLocale(), fetchTrainingHistory(supabase, user.id)])
  const today = bangkokToday()
  const view = progressView({ enrollments: history.enrollments, checkins: history.checkins, today })
  const active = history.enrollments.filter(item => item.status === 'active')
  const checkinMap: Record<string, string[]> = {}
  for (const row of history.checkins) (checkinMap[row.enrollment_id] ??= []).push(row.session_date)
  const streak = dayStreak({ available: history.available, enrollments: active, checkins: checkinMap }, today)
  const number = new Intl.NumberFormat(locale === 'th' ? 'th-TH' : 'en-GB')
  const shortDate = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const most = Math.max(1, ...view.weeks.map(week => week.sessions))
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
        </section>

        {history.available && !hasHistory && view.programmes.length === 0 && <section className="pf-card" aria-labelledby="pg-empty">
          <h2 id="pg-empty" className="pf-card-title">{t('empty.title')}</h2>
          <p className="pf-card-desc">{t('empty.body')}</p>
          <Link href="/training" className="pf-btn pf-btn-primary"><Dumbbell size={17} aria-hidden="true" />{t('empty.cta')}</Link>
        </section>}

        {history.available && (hasHistory || view.programmes.length > 0) && <>
          {hasHistory && <section className="pf-card pf-lv pg-level" aria-labelledby="pg-level">
            <div className="pf-lv-row"><h2 id="pg-level" className="pf-card-title">{t('level.title', { level: level.level })}</h2><span>{t('level.points', { points: number.format(level.points), target: number.format(level.target) })}</span></div>
            <div className="pf-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={level.percent} aria-labelledby="pg-level"><i style={{ width: `${level.percent}%` }} /></div>
            <p className="pf-note">{t('level.next', { count: level.sessionsToNext, next: level.level + 1 })}</p>
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
            <ol className="pg-weeks">
              {view.weeks.map(week => <li key={week.monday} aria-label={t('weeks.label', { date: shortDate.format(new Date(`${week.monday}T00:00:00Z`)), count: week.sessions })}>
                <span className="pg-bar" aria-hidden="true"><i style={{ height: `${Math.round(week.sessions / most * 100)}%` }} /></span>
                <b aria-hidden="true">{week.sessions}</b>
                <small aria-hidden="true">{shortDate.format(new Date(`${week.monday}T00:00:00Z`))}</small>
              </li>)}
            </ol>
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
