import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { MapPin, Trophy } from 'lucide-react'
import { sampleTournaments, isSampleId, showDemoData } from '@/lib/sample-data'
import { getPublicTournamentsPage } from '@/lib/public-data'
import { bangkokToday, groupTournamentsByMonth, parseTournamentView, TOURNAMENT_VIEWS, type PublicTournament } from '@/lib/public-tournaments'
import { tournamentCoverSport, tournamentCoverStatus } from '@/lib/tournament-cover'
import { tournamentDayBox, tournamentFee, tournamentMonthLabel } from '@/lib/tournament-dates'
import { parsePage } from '@/lib/pagination'
import { ACTIVE_SEASON } from '@/lib/season'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import './tournaments.css'

// Paper surface (docs/design-system.md): a list read in sunlight at the pitch. Three tabs,
// so finished tournaments never crowd page 1; each page is grouped by month and every card
// is one link. The card shows only what the row holds: a missing sport or status says
// nothing rather than guessing (lib/tournament-cover.ts).

export default async function TournamentsPage(props: { searchParams: Promise<{ page?: string | string[]; view?: string | string[] }> }) {
  const searchParams = await props.searchParams
  const page = parsePage(searchParams?.page)
  const view = parseTournamentView(searchParams?.view)
  const today = bangkokToday()
  const [{ tournaments, hasNext }, t, cover, locale] = await Promise.all([
    getPublicTournamentsPage(page, view, today),
    getTranslations('tournaments'),
    getTranslations('tournamentCover'),
    getLocale(),
  ])
  // Demo rows stand in only for an empty first page, never for a page past the end.
  const demo = tournaments.length === 0 && showDemoData && page === 1 && view !== 'past'
  const rows: PublicTournament[] = tournaments.length > 0 ? tournaments : demo ? sampleTournaments : []
  const params: Record<string, string> = view === 'upcoming' ? {} : { view }
  const groups = groupTournamentsByMonth(rows)
  // The soonest tournament gets the red date box: the one to act on first.
  const nextId = view !== 'past' && page === 1 ? rows[0]?.id : undefined

  return (
    <main className="bds-page tn-page">
      <PageHeader />
      <div className="tn-wrap">
        <div className="tn-top">
          <div>
            <p className="ui-eyebrow">{t('eyebrow', { season: ACTIVE_SEASON })}</p>
            <h1 className="ui-h1 tn-title">{t('title')}</h1>
            <p className="tn-intro">{t('intro')}</p>
          </div>
          <nav className="tn-tabs" aria-label={t('tabsLabel')}>
            {TOURNAMENT_VIEWS.map(item => <Link aria-current={item === view ? 'page' : undefined} className={item === view ? 'is-on' : ''} href={item === 'upcoming' ? '/tournaments' : `/tournaments?view=${item}`} key={item}>{t(`tabs.${item}`)}</Link>)}
          </nav>
        </div>

        {groups.length > 0
          ? groups.map(group => <section className="tn-month" key={group.month}>
              <h2 className="tn-month-label">{tournamentMonthLabel(locale, group.month)}</h2>
              <div className="tn-grid">
                {group.tournaments.map(item => {
                  const box = tournamentDayBox(locale, item.start_date)
                  const status = tournamentCoverStatus(item.status)
                  const sport = tournamentCoverSport((item as { sport?: unknown }).sport)
                  const fee = tournamentFee(item.fee)
                  const sample = isSampleId(item.id)
                  // Started already but not over (a league, a two-day cup): say so, so a
                  // date box in the past does not read as a mistake.
                  const live = view !== 'past' && item.start_date < today
                  return <Link className={`tn-card${view === 'past' ? ' is-past' : ''}`} href={sample ? '/login' : `/tournaments/${item.id}`} key={item.id}>
                    <span className={`tn-date${item.id === nextId ? ' is-next' : ''}`} aria-hidden="true"><b>{box.day}</b><small>{box.month}</small></span>
                    <span className="tn-body">
                      <span className="tn-head">
                        <b className="tn-name">{item.name}</b>
                        <span className="tn-fee">{fee ?? t('free')}{fee && <small>{t('perTeam')}</small>}</span>
                      </span>
                      {item.location && <span className="tn-venue"><MapPin size={13} aria-hidden="true" /><span>{item.location}</span></span>}
                      <span className="tn-chips">
                        {live && <span className="ui-chip is-red">{t('live')}</span>}
                        {status && <span className={`ui-chip ${status === 'open' ? 'is-performance' : 'is-self'}`}>{cover(`status.${status}`)}</span>}
                        {sport && <span className="ui-chip is-self">{cover(`sport.${sport}`)}</span>}
                        {Number(item.max_teams) > 0 && <span className="ui-chip is-self">{t('maxTeams', { count: Number(item.max_teams) })}</span>}
                        {sample && <span className="ui-chip is-warn">{t('sample')}</span>}
                      </span>
                    </span>
                  </Link>
                })}
              </div>
            </section>)
          : <div className="tn-empty ui-card">
              <Trophy size={40} strokeWidth={1.4} aria-hidden="true" />
              <p className="ui-h2">{t(`empty.${view}`)}</p>
              {view !== 'past' && <p className="tn-empty-hint">{t('emptyHint')}</p>}
              <div className="tn-empty-actions">
                {view !== 'past' && <Link className="ui-btn ui-btn-ghost ui-btn-sm" href="/dashboard">{t('emptyCta')}</Link>}
                {view !== 'past' && <Link className="ui-btn ui-btn-ghost ui-btn-sm" href="/tournaments?view=past">{t('seePast')}</Link>}
              </div>
            </div>}

        <Pagination basePath="/tournaments" page={page} hasNext={hasNext} params={params} />
      </div>
    </main>
  )
}
