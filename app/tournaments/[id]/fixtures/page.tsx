import Link from 'next/link'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowLeft, Calendar, CalendarClock, MapPin } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import FixtureBoard, { type BoardView } from '@/components/FixtureBoard'
import { fetchPublicDraw } from '@/lib/fixture-draw'
import { drawProgress } from '@/lib/fixture-view'
import { tournamentDateRange } from '@/lib/tournament-dates'
import '../../tournaments.css'

// A tournament's fixtures, results and tables for everyone, once its organizer has
// published them (sql/57). Read with the anonymous key: what a signed-out visitor sees
// is exactly what this page shows, whoever is looking. ?view= picks fixtures, tables or
// the knockout bracket, ?filter= a group and ?round= one round of a big draw, so every
// view is a plain link (a full page load: soft navigation dropped some taps, QA 4 Oct).
export const revalidate = 60

type Heading = { name: string; location: string | null; start_date: string; end_date: string | null }

async function fetchHeading(client: SupabaseClient, id: string): Promise<Heading | null> {
  try {
    const { data } = await client.from('tournaments').select('name, location, start_date, end_date').eq('id', id).maybeSingle()
    return data as Heading | null
  } catch {
    return null
  }
}

export default async function PublicFixturesPage(props: { params: Promise<{ id: string }>; searchParams?: Promise<{ view?: string; filter?: string; round?: string }> }) {
  const [params, searchParams] = await Promise.all([props.params, props.searchParams ?? Promise.resolve({} as { view?: string; filter?: string; round?: string })])
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const [t, locale, { draw, migrationMissing, failed }, heading] = await Promise.all([
    getTranslations('fixtures'),
    getLocale(),
    fetchPublicDraw(client, params.id),
    // The same public row the tournament page reads; without it the page still works.
    fetchHeading(client, params.id),
  ])
  const base = `/tournaments/${params.id}/fixtures`
  const href = (view: BoardView, filter?: string, round?: string) => {
    const query = new URLSearchParams()
    if (view !== 'fixtures') query.set('view', view)
    if (filter && filter !== 'all') query.set('filter', filter)
    if (round) query.set('round', round)
    return query.size ? `${base}?${query}` : base
  }
  const view = (['fixtures', 'tables', 'bracket'] as const).find(item => item === searchParams.view) ?? 'fixtures'
  const progress = draw ? drawProgress(draw) : null

  return (
    <main className="bds-page fxp-page">
      <PageHeader back={{ href: `/tournaments/${params.id}`, label: t('backToTournament') }} />
      <div className="fxp-hero ui-dark">
        <p className="fxp-eyebrow">{t('publicTitle')}</p>
        <h1>{heading?.name ?? t('publicTitle')}</h1>
        {heading && <ul className="tn-hero-meta">
          <li><Calendar size={16} aria-hidden="true" /><span>{tournamentDateRange(locale, heading.start_date, heading.end_date)}</span></li>
          {heading.location?.trim() && <li><MapPin size={16} aria-hidden="true" /><span>{heading.location.trim()}</span></li>}
        </ul>}
        {progress && progress.total > 0 && <div className="fxp-progress">
          <p>{t('progress', progress)}</p>
          <div className="fxp-track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.played} aria-label={t('progressLabel')}>
            <i style={{ width: `${Math.round(progress.played / progress.total * 100)}%` }} />
          </div>
        </div>}
      </div>
      <div className="fxp-body">
        {draw
          ? <FixtureBoard draw={draw} nav={{ view, filter: searchParams.filter ?? 'all', round: searchParams.round, href }} />
          : <div className="fxp-empty" role="status">
            <span className="fxp-empty-icon" aria-hidden="true"><CalendarClock size={28} /></span>
            <h2>{migrationMissing || failed ? t('publicUnavailable') : t('notPublished')}</h2>
            <p>{t('notPublishedHint')}</p>
            <Link href={`/tournaments/${params.id}`} className="fxp-empty-back"><ArrowLeft size={17} aria-hidden="true" />{t('emptyBack')}</Link>
          </div>}
      </div>
    </main>
  )
}
