import Link from 'next/link'
import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowRight, Banknote, Calendar, ChevronRight, CircleDot, ListOrdered, MapPin, SearchX, Users } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sampleTournaments, showDemoData } from '@/lib/sample-data'
import { bangkokToday } from '@/lib/public-tournaments'
import { tournamentCover } from '@/lib/tournament-cover'
import { tournamentCountdown, tournamentDateRange, tournamentDayBox, tournamentFee, type TournamentCountdown } from '@/lib/tournament-dates'
import { BACKDROP, STADIUM } from '@/lib/stock-photos'
import PageHeader from '@/components/PageHeader'
import TeamStep from './TeamStep'
import PaymentStep from './PaymentStep'
import ShareButton from './ShareButton'
import '../../glass.css'
import '../tournaments.css'

// One tournament in the light glass design (ADR-014): a stadium head with what, when,
// where and how much, and a glass panel with the countdown and the one way in; below, the
// overview, how to enter and the venue. On a phone the way in also sits at the thumb.
// The registration steps below keep the Paper look until they move to ADR-014. Entering a team is ?step=team; paying for a team
// already entered is ?teamId=… (the link /team-members gives once the roster is ready).
// The database has the last word on everything the buttons offer: who may enter, whether
// it is still open or full, and who may see a team.

type Tournament = {
  id: string
  name: string
  description: string | null
  location: string | null
  start_date: string
  end_date: string | null
  fee: number
  max_teams: number | null
  promptpay: string | null
  status: string | null
  fixtures_published_at?: string | null
  sport?: unknown
}

export default async function TournamentPage(props: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string; teamId?: string }> }) {
  const [{ id }, searchParams] = await Promise.all([props.params, props.searchParams])
  const supabase = await createServerSupabaseClient()
  const [{ data }, t, list, cover, locale] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).maybeSingle(),
    getTranslations('tournament'),
    getTranslations('tournaments'),
    getTranslations('tournamentCover'),
    getLocale(),
  ])
  const tournament = (data ?? (showDemoData ? sampleTournaments.find(item => item.id === id) : null)) as Tournament | null

  if (!tournament) {
    return <main className="bds-page tn-page">
      <PageHeader back={{ href: '/tournaments', label: t('back') }} />
      <div className="tn-wrap"><div className="tn-empty ui-card" role="status">
        <SearchX size={40} strokeWidth={1.4} aria-hidden="true" />
        <h1 className="ui-h2">{t('notFound')}</h1>
        <p className="tn-empty-hint">{t('notFoundHint')}</p>
      </div></div>
    </main>
  }

  const today = bangkokToday()
  const finished = (tournament.end_date ?? tournament.start_date) < today
  const live = !finished && tournament.start_date < today
  const open = tournament.status === 'open' && !finished
  const fee = tournamentFee(tournament.fee)
  const box = tournamentDayBox(locale, tournament.start_date)
  const summary = { ...box, name: tournament.name, line: [tournament.location, fee ? `${fee} ${t('perTeam')}` : t('free')].filter(Boolean).join(' · ') }
  const back = { href: '/tournaments', label: t('back') }
  const self = { href: `/tournaments/${tournament.id}`, label: tournament.name }

  if (searchParams.teamId) {
    // RLS lets the team's creator, the organizer and admins read it; anyone else sees no name.
    const { data: team } = await supabase.from('teams').select('name, status').eq('id', searchParams.teamId).maybeSingle()
    return <main className="bds-page tn-page tn-detail">
      <PageHeader back={self} />
      <PaymentStep fee={fee} promptpay={tournament.promptpay?.trim() || null} summary={summary} teamId={searchParams.teamId} teamName={team?.name ?? null} teamStatus={team?.status ?? null} tournamentId={tournament.id} />
    </main>
  }

  if (searchParams.step === 'team' && open) {
    return <main className="bds-page tn-page tn-detail">
      <PageHeader back={self} />
      <TeamStep free={!fee} summary={summary} tournamentId={tournament.id} />
    </main>
  }

  const heading = tournamentCover(tournament)
  const countdown = finished ? null : tournamentCountdown(today, tournament.start_date)
  const countdownText = (value: TournamentCountdown) =>
    value.kind === 'days' ? list('countdownDays', { count: value.count })
      : value.kind === 'today' ? list('countdownToday')
        : value.kind === 'tomorrow' ? list('countdownTomorrow') : list('live')
  const dates = tournamentDateRange(locale, tournament.start_date, tournament.end_date)
  const teams = Number(tournament.max_teams) > 0 ? Number(tournament.max_teams) : null
  const statusLabel = finished ? t('finished') : heading.status ? cover(`status.${heading.status}`) : null
  const registerHref = `/tournaments/${tournament.id}?step=team`
  const registerLabel = fee ? t('register', { fee }) : t('registerFree')
  const fixturesHref = `/tournaments/${tournament.id}/fixtures`
  // A map search for the venue the organizer typed: a link out, no embedded map.
  const mapHref = heading.venue ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(heading.venue)}` : null
  return (
    <main className="bds-page tn-page tn-detail tn-glass gl gl-scene" style={BACKDROP ? { '--gl-backdrop-photo': `url(${BACKDROP.src})` } as React.CSSProperties : undefined}>
      <PageHeader back={back} />
      <div className="tn-stadium gl-on-photo" style={STADIUM ? { '--gl-stadium-photo': `url(${STADIUM.src})` } as React.CSSProperties : undefined}>
        {heading.kind === 'photo' && <span className="tn-hero-photo"><Image alt={cover('photoAlt', { venue: heading.venue ?? '' })} fill sizes="100vw" src={heading.src} unoptimized /></span>}
        <div className="tn-d-head">
          <div className="tn-d-intro">
            <nav className="tn-d-crumbs" aria-label={t('back')}>
              <Link href="/tournaments">{t('back')}</Link>
              <ChevronRight size={14} aria-hidden="true" />
              <span aria-current="page">{tournament.name}</span>
            </nav>
            <h1 className="tn-d-title">{tournament.name}</h1>
            <p className="tn-d-chips">
              {statusLabel && <span className={`gl-status ${!finished && heading.status === 'open' ? 'is-open' : 'is-muted'}`}>{statusLabel}</span>}
              {live && <span className="gl-status is-live">{t('live')}</span>}
              {heading.sport && <span className="gl-status is-muted">{cover(`sport.${heading.sport}`)}</span>}
            </p>
            <ul className="tn-d-meta">
              <li><Calendar size={18} aria-hidden="true" /><span>{dates}</span></li>
              {heading.venue && <li><MapPin size={18} aria-hidden="true" /><span>{heading.venue}</span></li>}
              <li className="gl-num"><Banknote size={18} aria-hidden="true" /><span>{fee ? `${fee} ${t('perTeam')}` : t('free')}</span></li>
              {teams && <li className="gl-num"><Users size={18} aria-hidden="true" /><span>{t('maxTeams')} {teams} {t('teams')}</span></li>}
            </ul>
          </div>
          <aside className="tn-d-cta gl-panel" aria-label={registerLabel}>
            {countdown && <div className="tn-d-count"><small>{t('startsIn')}</small><b className={`gl-num${countdown.kind === 'live' ? ' is-live' : ''}`}>{countdownText(countdown)}</b></div>}
            {open
              ? <Link className="gl-btn gl-btn-primary tn-d-register" href={registerHref}>{registerLabel}<ArrowRight size={18} aria-hidden="true" /></Link>
              : <p className="tn-d-closed" role="status">{finished ? t('finished') : t('closed')}</p>}
            <div className="tn-d-cta-row">
              <ShareButton title={tournament.name} label={t('share')} copiedLabel={t('shareCopied')} />
              <Link className="gl-btn gl-btn-secondary tn-d-fixtures" href={fixturesHref}><ListOrdered size={18} aria-hidden="true" />{t('fixturesTab')}</Link>
            </div>
          </aside>
        </div>
      </div>

      <div className="tn-wrap">
        <div className="tn-board gl-card">
          <nav className="tn-d-tabs" aria-label={t('sectionsLabel')}>
            <a className="is-on" href="#tn-overview">{t('overviewTab')}</a>
            {!finished && <a href="#tn-how">{t('howTab')}</a>}
            <Link href={fixturesHref}>{t('fixturesTab')}</Link>
            <a href="#tn-venue">{t('venueTab')}</a>
          </nav>

          <div className="tn-d-grid">
            <div className="tn-d-main">
              <section className="tn-d-section" id="tn-overview">
                <h2>{t('about')}</h2>
                {tournament.description?.trim()
                  ? <p className="tn-desc">{tournament.description.trim()}</p>
                  : <p className="tn-d-muted">{t('overviewEmpty')}</p>}
                <dl className="tn-d-facts">
                  <div><Calendar size={20} aria-hidden="true" /><dt>{t('factDates')}</dt><dd>{dates}</dd></div>
                  <div><MapPin size={20} aria-hidden="true" /><dt>{t('factVenue')}</dt><dd>{heading.venue ?? '—'}</dd></div>
                  <div><Banknote size={20} aria-hidden="true" /><dt>{t('fee')}</dt><dd className="gl-num">{fee ? `${fee} ${t('perTeam')}` : t('free')}</dd></div>
                  <div><Users size={20} aria-hidden="true" /><dt>{t('maxTeams')}</dt><dd className="gl-num">{teams ? `${teams} ${t('teams')}` : '—'}</dd></div>
                  <div><CircleDot size={20} aria-hidden="true" /><dt>{t('factStatus')}</dt><dd>{statusLabel ?? '—'}</dd></div>
                  <div><ListOrdered size={20} aria-hidden="true" /><dt>{t('factFixtures')}</dt><dd>{tournament.fixtures_published_at ? t('fixturesPublished') : t('fixturesNotYet')}</dd></div>
                </dl>
              </section>

              {!finished && <section className="tn-d-section" id="tn-how">
                <h2>{t('howTitle')}</h2>
                <ol className="tn-d-steps">
                  {(['team', 'invite', fee ? 'submit' : 'submitFree'] as const).map((step, index) => <li key={step}><i>{index + 1}</i><div><b>{t(`how.${step}.title`)}</b><small>{t(`how.${step}.text`)}</small></div></li>)}
                </ol>
              </section>}
            </div>

            <div className="tn-d-side">
              <section className="tn-d-card gl-card gl-reveal" id="tn-venue">
                <h2>{t('venueTitle')}</h2>
                <p className="tn-d-venue"><MapPin size={18} aria-hidden="true" /><span>{heading.venue ?? t('noVenue')}</span></p>
                {mapHref && <a className="gl-btn gl-btn-secondary tn-d-map" href={mapHref} target="_blank" rel="noopener noreferrer">{t('openMap')}<ArrowRight size={16} aria-hidden="true" /></a>}
              </section>
              <Link className="tn-d-card gl-card gl-reveal tn-d-linkcard" href={fixturesHref}>
                <span className="tn-link-icon"><ListOrdered size={20} aria-hidden="true" /></span>
                <span className="tn-link-text"><b>{t('fixturesTitle')}</b><small>{tournament.fixtures_published_at ? t('fixturesPublished') : t('fixturesNotYet')}</small></span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
              {!finished && <p className="tn-d-card gl-card tn-d-athlete">{t('athleteHint')} <Link href="/team-members">{t('athleteLink')}</Link></p>}
            </div>
          </div>
        </div>
      </div>

      {/* On a phone the way in also sits at the thumb; a closed tournament says so in the head. */}
      {open && <div className="tn-dock tn-d-dock"><div className="tn-dock-inner">
        <Link className="gl-btn gl-btn-primary" href={registerHref}>{registerLabel}</Link>
      </div></div>}
    </main>
  )
}
