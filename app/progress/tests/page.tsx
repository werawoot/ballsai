import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { thaiDate } from '@/lib/athlete-private'
import { fetchMySelfTests } from '@/lib/training/self-test-data'
import { selfTestsEnabled, selfTestSummary, testsFor, SELF_TESTS } from '@/lib/training/self-tests'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import SelfTestRunner, { type SelfTestCard } from './SelfTestRunner'
import '../../glass.css'
import '../../profile/profile.css'

// /progress/tests: the three self-tests (owner, 10 and 11 Nov 2026; sql/96). Hidden unless
// NEXT_PUBLIC_SELF_TESTS is "true", until a licensed coach or physiotherapist signs off the
// protocols. Every number is the athlete's own entry, compared only with their own last one.

export const dynamic = 'force-dynamic'

export default async function SelfTestsPage() {
  if (!selfTestsEnabled()) notFound()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/progress/tests')

  const [t, locale, mine] = await Promise.all([getTranslations('selfTests'), getLocale(), fetchMySelfTests(supabase, user.id)])
  const today = thaiDate(new Date())
  const cards: SelfTestCard[] = testsFor(mine.birthDate, today).map(({ key, open }) => {
    return { spec: SELF_TESTS[key], open, ...selfTestSummary(mine.rows, key, today) }
  })

  return (
    <main className="pf pf-progress gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.training)}>
      <PageHeader eyebrow={t('eyebrow')} />
      <div className="pf-shell pg-shell">
        <section className="pf-card" aria-labelledby="st-title">
          <h1 id="st-title" className="pf-card-title">{t('title')}</h1>
          <p><span className="pf-chip">{t('draft')}</span></p>
          <p className="pf-card-desc">{t('lead')}</p>
          <p className="pf-note">{t('rules')}</p>
        </section>
        {mine.status === 'ready'
          ? <SelfTestRunner cards={cards} locale={locale} />
          : <section className="pf-card"><p className="pf-note" role="status">{t(mine.status === 'notAthlete' ? 'needAthlete' : 'notReady')}</p></section>}
      </div>
    </main>
  )
}
