import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, ClipboardPlus, LayoutGrid, List, MapPin, Search, Trophy, Users, X } from 'lucide-react'
import { sampleTournaments, isSampleId, showDemoData } from '@/lib/sample-data'
import { getPublicTournamentsPage } from '@/lib/public-data'
import { bangkokToday, groupTournamentsByMonth, parseTournamentQuery, parseTournamentSort, parseTournamentView, TOURNAMENT_SORTS, TOURNAMENT_VIEWS, type PublicTournament } from '@/lib/public-tournaments'
import { tournamentCoverSport, tournamentCoverStatus } from '@/lib/tournament-cover'
import { tournamentCountdown, tournamentDateRange, tournamentDayBox, tournamentFee, tournamentMonthLabel, type TournamentCountdown } from '@/lib/tournament-dates'
import { parsePage } from '@/lib/pagination'
import { BACKDROP, coverDetailFor, PAGE_PHOTOS } from '@/lib/stock-photos'
import { ACTIVE_SEASON } from '@/lib/season'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import MonthPills from './MonthPills'
import SortSelect from './SortSelect'
import TabPills from './TabPills'
import '../glass.css'
import './tournaments.css'

// The light glass design (ADR-014, app/glass.css): a stadium head, then one white board
// that rises over it with the tabs, the next tournament as the one thing to act on (how
// far off it is and one way in, with arrows to the next few) and the rest by month as
// cards or rows, with a jump to each month. A search by name or venue and the order live
// in the URL, so a filtered list can be shared and paged. Three tabs, so finished
// tournaments never crowd page 1. A card shows only what the row holds: a missing sport or
// status says nothing rather than guessing, and its cover is a licensed close crop of pitch
// markings, never a whole ground that would pass for the venue (lib/stock-photos.ts).

// How many of the soonest tournaments the lead card's arrows step through.
const SPOTLIGHT_MAX = 5

type Search = { page?: string | string[]; view?: string | string[]; q?: string | string[]; sort?: string | string[]; layout?: string | string[]; spot?: string | string[] }

export default async function TournamentsPage(props: { searchParams: Promise<Search> }) {
  const searchParams = await props.searchParams
  const page = parsePage(searchParams?.page)
  const view = parseTournamentView(searchParams?.view)
  const query = parseTournamentQuery(searchParams?.q)
  const sort = parseTournamentSort(searchParams?.sort, view)
  const defaultSort = parseTournamentSort(undefined, view)
  const layout = (Array.isArray(searchParams?.layout) ? searchParams.layout[0] : searchParams?.layout) === 'rows' ? 'rows' : 'cards'
  const today = bangkokToday()
  const [{ tournaments, hasNext }, t, cover, locale] = await Promise.all([
    getPublicTournamentsPage(page, view, today, query, sort === defaultSort ? undefined : sort),
    getTranslations('tournaments'),
    getTranslations('tournamentCover'),
    getLocale(),
  ])
  // Demo rows stand in only for an empty, unsearched first page, never for a page past
  // the end or a search that found nothing.
  const demo = tournaments.length === 0 && showDemoData && page === 1 && view !== 'past' && !query
  const rows: PublicTournament[] = tournaments.length > 0 ? tournaments : demo ? sampleTournaments : []
  // Everything that shapes the list, kept in every link that changes one part of it.
  const state: Record<string, string> = {
    ...(view === 'upcoming' ? {} : { view }),
    ...(query ? { q: query } : {}),
    ...(sort === defaultSort ? {} : { sort }),
    ...(layout === 'rows' ? { layout } : {}),
  }
  const link = (change: Record<string, string | undefined>) => {
    const next = new URLSearchParams(Object.entries({ ...state, ...change }).filter((entry): entry is [string, string] => Boolean(entry[1])))
    const text = next.toString()
    return text ? `/tournaments?${text}` : '/tournaments'
  }
  // The soonest tournament leads the first page of a tab that looks ahead, in its usual
  // order; its arrows step through the next few, which then leave the list below.
  const spotlight = view !== 'past' && page === 1 && sort === 'soonest' && !query ? rows.slice(0, SPOTLIGHT_MAX) : []
  const rawSpot = Number(Array.isArray(searchParams?.spot) ? searchParams.spot[0] : searchParams?.spot)
  const spot = Number.isInteger(rawSpot) && rawSpot > 0 && rawSpot < spotlight.length ? rawSpot : 0
  const next = spotlight[spot]
  const groups = groupTournamentsByMonth(next ? rows.filter(row => row !== next) : rows)
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

  // A tab keeps the search and the view, not the order: each tab has its own default.
  const tabs = <TabPills label={t('tabsLabel')} items={TOURNAMENT_VIEWS.map(item => ({ href: link({ view: item === 'upcoming' ? undefined : item, sort: undefined }), text: t(`tabs.${item}`), active: item === view }))} />
  // A licensed close crop of pitch markings behind a card's date, never a whole ground
  // (lib/stock-photos.ts); with none set, the brand graphic shows instead.
  const coverStyle = (id: string) => {
    const photo = coverDetailFor(id)
    return photo ? { backgroundImage: `url(${photo.src})` } : undefined
  }
  const spotStep = (step: number) => link({ spot: String((spot + step + spotlight.length) % spotlight.length) })

  return (
    <main className="bds-page tn-page tn-list gl gl-scene" style={BACKDROP ? { '--gl-backdrop-photo': `url(${BACKDROP.src})` } as React.CSSProperties : undefined}>
      <PageHeader />
      <div className="tn-stadium gl-on-photo" style={{ '--gl-stadium-photo': `url(${PAGE_PHOTOS.tournaments.src})` } as React.CSSProperties}>
        <div className="tn-stadium-inner">
          <p className="tn-eyebrow">{t('eyebrow', { season: ACTIVE_SEASON })}</p>
          <h1 className="tn-title">{t('title')}</h1>
          <p className="tn-intro">{t('introLine1')}<br />{t('introLine2')}</p>
          <form className="tn-search" action="/tournaments" role="search">
            {view !== 'upcoming' && <input type="hidden" name="view" value={view} />}
            {layout === 'rows' && <input type="hidden" name="layout" value="rows" />}
            <label className="tn-search-box">
              <Search size={20} aria-hidden="true" />
              <span className="tn-sr">{t('searchLabel')}</span>
              <input type="search" name="q" defaultValue={query} placeholder={t('searchPlaceholder')} maxLength={60} enterKeyHint="search" />
            </label>
            <button className="gl-btn gl-btn-primary tn-search-go" type="submit">{t('searchButton')}</button>
            {query && <Link className="tn-search-clear" href={link({ q: undefined })}><X size={16} aria-hidden="true" />{t('searchClear')}</Link>}
            <SortSelect id="tn-sort" label={t('sortLabel')} value={sort} options={TOURNAMENT_SORTS.map(item => ({ value: item, label: t(`sort.${item}`) }))} />
          </form>
        </div>
      </div>

      <div className="tn-wrap">
        <div className="tn-board gl-card">
          <div className="tn-toolbar">
            {tabs}
            <nav className="tn-layout" aria-label={t('layoutLabel')}>
              <Link aria-current={layout === 'cards' ? 'true' : undefined} className={layout === 'cards' ? 'is-on' : ''} href={link({ layout: undefined, spot: undefined })}><LayoutGrid size={16} aria-hidden="true" />{t('layout.cards')}</Link>
              <Link aria-current={layout === 'rows' ? 'true' : undefined} className={layout === 'rows' ? 'is-on' : ''} href={link({ layout: 'rows', spot: undefined })}><List size={16} aria-hidden="true" />{t('layout.rows')}</Link>
            </nav>
          </div>
          {query && <p className="tn-search-for">{t('searchFor', { query })}</p>}

          {next && nextBox && nextCountdown && <section className="tn-next gl-card" id="tn-next" aria-labelledby="tn-next-name">
            {spotlight.length > 1 && <>
              <Link className="tn-spot tn-spot-prev" href={spotStep(-1)} aria-label={t('spotPrev')} scroll={false}><ChevronLeft size={20} aria-hidden="true" /></Link>
              <Link className="tn-spot tn-spot-next" href={spotStep(1)} aria-label={t('spotNext')} scroll={false}><ChevronRight size={20} aria-hidden="true" /></Link>
            </>}
            <div className={`tn-next-cover${coverStyle(next.id) ? ' is-photo' : ''}`} aria-hidden="true">
              {coverStyle(next.id) && <span className="gl-cover-img" style={coverStyle(next.id)} />}
              <Trophy className="tn-cover-mark" size={64} strokeWidth={1.2} />
              <span className="tn-next-tag">{t('spotlightLabel')}</span>
              <span className="tn-next-date gl-num"><b>{nextBox.day}</b><small>{nextBox.month}</small></span>
            </div>
            <div className="tn-next-text">
              <p className="tn-next-chips">
                {nextStatus && <span className={`gl-status ${nextOpen ? 'is-open' : 'is-muted'}`}>{cover(`status.${nextStatus}`)}</span>}
                {isSampleId(next.id) && <span className="gl-status is-warn">{t('sample')}</span>}
              </p>
              <h2 className="tn-next-name" id="tn-next-name">{next.name}</h2>
              <ul className="tn-next-facts">
                {next.location && <li><MapPin size={16} aria-hidden="true" /><span>{next.location}</span></li>}
                <li><CalendarDays size={16} aria-hidden="true" /><span>{tournamentDateRange(locale, next.start_date, next.end_date)}</span></li>
              </ul>
              <dl className="tn-next-stats gl-num">
                <div><dt>{t('statFee')}</dt><dd>{nextFee ?? t('free')}{nextFee && <small>{t('perTeam')}</small>}</dd></div>
                {Number(next.max_teams) > 0 && <div><dt>{t('statTeams')}</dt><dd><Users size={16} aria-hidden="true" />{Number(next.max_teams)}</dd></div>}
              </dl>
            </div>
            <div className="tn-next-side">
              <div className="tn-next-countdown">
                <small>{t('startsIn')}</small>
                <span className={`tn-next-count${nextLive ? ' is-live' : ''}`}>{nextLive && <i aria-hidden="true" />}{countdownText(nextCountdown)}</span>
              </div>
              <Link className="gl-btn gl-btn-primary tn-next-cta" href={nextHref}>{nextOpen ? t('spotlightOpen') : t('spotlightView')}<ArrowRight size={18} aria-hidden="true" /></Link>
            </div>
          </section>}

          {groups.length > 0 && <>
            <h2 className="tn-by-month">{t('byMonth')}</h2>
            {groups.length > 1 && <MonthPills label={t('monthsLabel')} moreLabel={t('monthsMore')} months={groups.map(group => ({ id: `tn-month-${group.month}`, label: tournamentMonthLabel(locale, group.month) }))} />}
          </>}

          {groups.length > 0
            ? groups.map(group => <section className="tn-month" id={`tn-month-${group.month}`} key={group.month}>
                <h3 className="tn-month-label">{tournamentMonthLabel(locale, group.month)}<span>{t('monthCount', { count: group.tournaments.length })}</span></h3>
                <div className={`tn-grid${layout === 'rows' ? ' is-rows' : ''}`}>
                  {group.tournaments.map(item => {
                    const box = tournamentDayBox(locale, item.start_date)
                    const status = tournamentCoverStatus(item.status)
                    const sport = tournamentCoverSport((item as { sport?: unknown }).sport)
                    const fee = tournamentFee(item.fee)
                    const sample = isSampleId(item.id)
                    // Started already but not over (a league, a two-day cup): say so, so a
                    // date box in the past does not read as a mistake.
                    const live = view !== 'past' && item.start_date < today
                    return <Link className={`tn-card gl-card gl-reveal${view === 'past' ? ' is-past' : ''}`} href={sample ? '/login' : `/tournaments/${item.id}`} key={item.id}>
                      <span className={`tn-cover${coverStyle(item.id) ? ' is-photo' : ''}`} aria-hidden="true">
                        {coverStyle(item.id) && <span className="gl-cover-img" style={coverStyle(item.id)} />}
                        <Trophy className="tn-cover-mark" size={52} strokeWidth={1.2} />
                        <span className="tn-cover-date gl-num"><b>{box.day}</b><small>{box.month}</small></span>
                      </span>
                      <span className="tn-body">
                        <span className="tn-chips">
                          {live && <span className="gl-status is-live">{t('live')}</span>}
                          {status && <span className={`gl-status ${status === 'open' ? 'is-open' : 'is-muted'}`}>{cover(`status.${status}`)}</span>}
                          {sport && <span className="gl-status is-muted">{cover(`sport.${sport}`)}</span>}
                          {sample && <span className="gl-status is-warn">{t('sample')}</span>}
                        </span>
                        <b className="tn-name">{item.name}</b>
                        {item.location && <span className="tn-meta"><MapPin size={14} aria-hidden="true" /><span>{item.location}</span></span>}
                        <span className="tn-meta"><CalendarDays size={14} aria-hidden="true" /><span>{tournamentDateRange(locale, item.start_date, item.end_date)}</span></span>
                        <span className="tn-foot gl-num">
                          <span className="tn-fee">{fee ?? t('free')}{fee && <small>{t('perTeam')}</small>}</span>
                          {Number(item.max_teams) > 0 && <span className="tn-teams"><Users size={14} aria-hidden="true" />{t('maxTeams', { count: Number(item.max_teams) })}</span>}
                        </span>
                        <span className="tn-more">{t('spotlightView')}<ArrowRight size={16} aria-hidden="true" /></span>
                      </span>
                    </Link>
                  })}
                </div>
              </section>)
            : !next && query ? <div className="tn-empty">
                <Search size={40} strokeWidth={1.4} aria-hidden="true" />
                <p className="ui-h2">{t('searchEmpty', { query })}</p>
                <p className="tn-empty-hint">{t('searchEmptyHint')}</p>
                <div className="tn-empty-actions"><Link className="gl-btn gl-btn-secondary" href={link({ q: undefined })}>{t('searchClear')}</Link></div>
              </div>
            : !next && <div className="tn-empty">
                <Trophy size={40} strokeWidth={1.4} aria-hidden="true" />
                <p className="ui-h2">{t(`empty.${view}`)}</p>
                {view !== 'past' && <p className="tn-empty-hint">{t('emptyHint')}</p>}
                <div className="tn-empty-actions">
                  {view !== 'past' && <Link className="gl-btn gl-btn-secondary" href="/dashboard">{t('emptyCta')}</Link>}
                  {view !== 'past' && <Link className="gl-btn gl-btn-secondary" href="/tournaments?view=past">{t('seePast')}</Link>}
                </div>
              </div>}

          <Pagination basePath="/tournaments" page={page} hasNext={hasNext} params={state} />
        </div>

        {(next || groups.length > 0) && view !== 'past' && <div className="tn-organizer gl-card gl-reveal">
          <span className="tn-organizer-icon"><ClipboardPlus size={22} aria-hidden="true" /></span>
          <span className="tn-organizer-text"><b>{t('organizerTitle')}</b><small>{t('organizerBody')}</small></span>
          <Link className="gl-btn gl-btn-primary tn-organizer-cta" href="/dashboard">{t('createCta')}<ArrowRight size={18} aria-hidden="true" /></Link>
        </div>}
      </div>
    </main>
  )
}
