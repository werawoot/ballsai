import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronLeft } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchSelfTestHistory } from '@/lib/training/self-test-data'
import { isSelfTestKey, selfTestsEnabled, SELF_TESTS } from '@/lib/training/self-tests'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import DeleteResultButton from './DeleteResultButton'
import '../../../glass.css'
import '../../../profile/profile.css'

// /progress/tests/history?test=juggling: every result of one self-test, newest first, a page of
// 20 at a time (owner, 13 Nov 2026), each with a delete button (the athlete may delete their own
// result, owner 11 Nov 2026). Hidden like the tests until the coach sign-off. Self-entered only.

export const dynamic = 'force-dynamic'

const DAY = /^\d{4}-\d{2}-\d{2}$/

export default async function SelfTestHistoryPage(props: { searchParams: Promise<{ test?: string; before?: string }> }) {
  if (!selfTestsEnabled()) notFound()
  const { test, before } = await props.searchParams
  if (!isSelfTestKey(test)) notFound()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/login?next=${encodeURIComponent(`/progress/tests/history?test=${test}`)}`)

  const cursor = before && DAY.test(before) ? before : null
  const [t, locale, history] = await Promise.all([getTranslations('selfTests'), getLocale(), fetchSelfTestHistory(supabase, user.id, test, cursor)])
  const unit = t(`units.${SELF_TESTS[test].unit}`)
  const date = new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const day = (value: string) => date.format(new Date(`${value}T00:00:00Z`))
  const name = t(`tests.${test}.name`)
  const last = history.rows[history.rows.length - 1]

  return (
    <main className="pf pf-progress gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.training)}>
      <PageHeader eyebrow={t('eyebrow')} back={{ href: '/progress/tests', label: t('history.back') }} />
      <div className="pf-shell pg-shell">
        <section className="pf-card" aria-labelledby="sh-title">
          <h1 id="sh-title" className="pf-card-title">{t('history.title', { name })}</h1>
          <p><span className="pf-chip">{t('self')}</span></p>
          <p className="pf-note">{t('history.note')}</p>
          {!history.ready
            ? <p className="pf-note" role="status">{t('notReady')}</p>
            : history.rows.length === 0
              ? <p className="pf-card-desc">{cursor ? t('history.noOlder') : t('none')}</p>
              : <ul className="pf-list st-history">
                {history.rows.map(row => <li key={row.test_date}>
                  <div className="pf-list-main">
                    <b>{row.value} {unit}</b>
                    <span>{day(row.test_date)}</span>
                  </div>
                  <DeleteResultButton test={test} date={row.test_date} label={t('history.delete')} confirm={t('history.deleteConfirm', { date: day(row.test_date) })} failed={t('history.deleteFailed')} />
                </li>)}
              </ul>}
          <p className="st-history-nav">
            {cursor && <Link href={`/progress/tests/history?test=${test}`} className="pf-btn pf-btn-ghost"><ChevronLeft size={16} aria-hidden="true" />{t('history.newest')}</Link>}
            {history.hasMore && last && <Link href={`/progress/tests/history?test=${test}&before=${last.test_date}`} className="pf-btn pf-btn-ghost">{t('history.older')}</Link>}
          </p>
        </section>
      </div>
    </main>
  )
}
