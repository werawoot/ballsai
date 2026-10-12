import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowRight, ChevronRight, ClipboardPlus, MapPin, Trophy, Users } from 'lucide-react'
import { sampleTournaments, isSampleId, showDemoData } from '@/lib/sample-data'
import { getPublicTournamentsPage } from '@/lib/public-data'
import { bangkokToday, groupTournamentsByMonth, parseTournamentView, TOURNAMENT_VIEWS, type PublicTournament } from '@/lib/public-tournaments'
import { tournamentCoverSport, tournamentCoverStatus } from '@/lib/tournament-cover'
import { tournamentCountdown, tournamentDayBox, tournamentFee, tournamentMonthLabel, type TournamentCountdown } from '@/lib/tournament-dates'
import { parsePage } from '@/lib/pagination'
import { ACTIVE_SEASON } from '@/lib/season'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import './tournaments.css'

// A Stadium head (docs/design-system.md) that carries on from the site header, with the
// next tournament as the one thing to act on: how far off it is and one way in. Below it,
// Paper: the rest by month, read in sunlight at the pitch. Three tabs, so finished
// tournaments never crowd page 1. A card shows only what the row holds: a missing sport or
// status says nothing rather than guessing (lib/tournament-cover.ts).

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
  // The soonest tournament leads the page on the first page of a tab that looks ahead.
  const next = view !== 'past' && page === 1 ? rows[0] : undefined
  const groups = groupTournamentsByMonth(next ? rows.slice(1) : rows)
  const countdownText = (countdown: TournamentCountdown) =>
    countdown.kind === 'days' ? t('countdownDays', { count: countdown.count })
      : countdown.kind === 'today' ? t('countdownToday')
        : countdown.kind === 'tomorrow' ? t('countdownTomorrow') : t('live')
  const nextBox = next ? tournamentDayBox(locale, next.start_date) : null
  const nextCountdown = next ? tournamentCountdown(today, next.start_date) : null
  const nextFee = next ? tournamentFee(next.fee) : null
  const nextStatus = next ? tournamentCoverStatus(next.status) : null
  const nextOpen = nextStatus === 'open'
  const nextHref = next ? (isSampleId(next.id) ? '/login' : `/tournaments/${next.id}`) : ''
  const nextLive = nextCountdown?.kind === 'live'

  return (
    <main className="bds-page tn-page">
      <PageHeader />
      <div className="tn-stadium">
        <div className="tn-stadium-inner">
          <div className="tn-top">
            <p className="tn-eyebrow">{t('eyebrow', { season: ACTIVE_SEASON })}</p>
            <h1 className="tn-title">{t('title')}</h1>
            <p className="tn-intro">{t('intro')}</p>
            <nav className="tn-tabs" aria-label={t('tabsLabel')}>
              {TOURNAMENT_VIEWS.map(item => <Link aria-current={item === view ? 'page' : undefined} className={item === view ? 'is-on' : ''} href={item === 'upcoming' ? '/tournaments' : `/tournaments?view=${item}`} key={item}>{t(`tabs.${item}`)}</Link>)}
            </nav>
          </div>

          {next && nextBox && nextCountdown && <section className="tn-next" id="tn-next" aria-labelledby="tn-next-name">
            <p className="tn-next-label"><span className={`tn-next-count${nextLive ? ' is-live' : ''}`}>{nextLive && <i aria-hidden="true" />}{countdownText(nextCountdown)}</span><span>{t('spotlightLabel')}</span></p>
            <div className="tn-next-main">
              <span className="tn-next-date" aria-hidden="true"><b>{nextBox.day}</b><small>{nextBox.month}</small></span>
              <div className="tn-next-text">
                <h2 className="tn-next-name" id="tn-next-name">{next.name}</h2>
                {next.location && <p className="tn-next-venue"><MapPin size={14} aria-hidden="true" /><span>{next.location}</span></p>}
              </div>
            </div>
            <dl className="tn-next-stats">
              <div><dt>{t('statFee')}</dt><dd>{nextFee ?? t('free')}{nextFee && <small>{t('perTeam')}</small>}</dd></div>
              {Number(next.max_teams) > 0 && <div><dt>{t('statTeams')}</dt><dd><Users size={15} aria-hidden="true" />{Number(next.max_teams)}</dd></div>}
              {nextStatus && <div><dt>&nbsp;</dt><dd><span className={`ui-chip ${nextOpen ? 'is-performance' : 'is-self'}`}>{cover(`status.${nextStatus}`)}</span></dd></div>}
            </dl>
            <Link className="ui-btn ui-btn-primary tn-next-cta" href={nextHref}>{nextOpen ? t('spotlightOpen') : t('spotlightView')}<ArrowRight size={18} aria-hidden="true" /></Link>
          </section>}
        </div>
      </div>

      <div className="tn-wrap">

        {groups.length > 0
          ? groups.map(group => <section className="tn-month" key={group.month}>
              <h2 className="tn-month-label">{tournamentMonthLabel(locale, group.month)}<span>{t('monthCount', { count: group.tournaments.length })}</span></h2>
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
                    <span className="tn-date" aria-hidden="true"><b>{box.day}</b><small>{box.month}</small></span>
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
                    <ChevronRight className="tn-chevron" size={18} aria-hidden="true" />
                  </Link>
                })}
              </div>
            </section>)
          : !next && <div className="tn-empty ui-card">
              <Trophy size={40} strokeWidth={1.4} aria-hidden="true" />
              <p className="ui-h2">{t(`empty.${view}`)}</p>
              {view !== 'past' && <p className="tn-empty-hint">{t('emptyHint')}</p>}
              <div className="tn-empty-actions">
                {view !== 'past' && <Link className="ui-btn ui-btn-ghost ui-btn-sm" href="/dashboard">{t('emptyCta')}</Link>}
                {view !== 'past' && <Link className="ui-btn ui-btn-ghost ui-btn-sm" href="/tournaments?view=past">{t('seePast')}</Link>}
              </div>
            </div>}

        <Pagination basePath="/tournaments" page={page} hasNext={hasNext} params={params} />

        {(next || groups.length > 0) && view !== 'past' && <Link className="tn-organizer" href="/dashboard">
          <span className="tn-organizer-icon"><ClipboardPlus size={22} aria-hidden="true" /></span>
          <span className="tn-organizer-text"><b>{t('organizerTitle')}</b><small>{t('organizerBody')}</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>}
      </div>
    </main>
  )
}
