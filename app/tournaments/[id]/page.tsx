import Link from 'next/link'
import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { Calendar, ChevronRight, ListOrdered, MapPin, SearchX } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { sampleTournaments, showDemoData } from '@/lib/sample-data'
import { bangkokToday } from '@/lib/public-tournaments'
import { tournamentCover } from '@/lib/tournament-cover'
import { tournamentDateRange, tournamentDayBox, tournamentFee } from '@/lib/tournament-dates'
import PageHeader from '@/components/PageHeader'
import TeamStep from './TeamStep'
import PaymentStep from './PaymentStep'
import '../tournaments.css'

// One tournament: what, when, where and how much first (Stadium header, Paper facts),
// then one primary action at the thumb. Entering a team is ?step=team; paying for a team
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
  const [{ data }, t, cover, locale] = await Promise.all([
    supabase.from('tournaments').select('*').eq('id', id).maybeSingle(),
    getTranslations('tournament'),
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
  return (
    <main className="bds-page tn-page tn-detail">
      <PageHeader back={back} />
      <div className="tn-hero ui-dark">
        {heading.kind === 'photo' && <span className="tn-hero-photo"><Image alt={cover('photoAlt', { venue: heading.venue ?? '' })} fill sizes="100vw" src={heading.src} unoptimized /></span>}
        <div className="tn-hero-inner">
          <div className="tn-hero-chips">
            {finished
              ? <span className="ui-chip is-self">{t('finished')}</span>
              : heading.status && <span className={`ui-chip ${heading.status === 'open' ? 'is-performance' : 'is-self'}`}>{cover(`status.${heading.status}`)}</span>}
            {live && <span className="ui-chip is-red">{t('live')}</span>}
            {heading.sport && <span className="ui-chip is-self">{cover(`sport.${heading.sport}`)}</span>}
          </div>
          <h1>{tournament.name}</h1>
          <ul className="tn-hero-meta">
            <li><Calendar size={16} aria-hidden="true" /><span>{tournamentDateRange(locale, tournament.start_date, tournament.end_date)}</span></li>
            {heading.venue && <li><MapPin size={16} aria-hidden="true" /><span>{heading.venue}</span></li>}
          </ul>
        </div>
      </div>

      <div className="tn-detail-body">
        <div className="tn-facts">
          <div className="tn-fact"><small>{t('fee')}</small><b>{fee ?? t('free')}</b>{fee && <span>{t('perTeam')}</span>}</div>
          {Number(tournament.max_teams) > 0 && <div className="tn-fact"><small>{t('maxTeams')}</small><b>{Number(tournament.max_teams)}</b><span>{t('teams')}</span></div>}
        </div>

        <Link className="tn-link" href={`/tournaments/${tournament.id}/fixtures`}>
          <span className="tn-link-icon"><ListOrdered size={20} aria-hidden="true" /></span>
          <span className="tn-link-text"><b>{t('fixturesTitle')}</b><small>{tournament.fixtures_published_at ? t('fixturesPublished') : t('fixturesNotYet')}</small></span>
          <ChevronRight size={18} aria-hidden="true" />
        </Link>

        {tournament.description?.trim() && <section className="tn-section">
          <h2>{t('about')}</h2>
          <p className="tn-desc">{tournament.description.trim()}</p>
        </section>}

        {!finished && <section className="tn-section">
          <h2>{t('howTitle')}</h2>
          <ol className="ui-card tn-steps">
            {(['team', 'invite', fee ? 'submit' : 'submitFree'] as const).map((step, index) => <li key={step}><i>{index + 1}</i><div><b>{t(`how.${step}.title`)}</b><small>{t(`how.${step}.text`)}</small></div></li>)}
          </ol>
        </section>}
      </div>

      <div className="tn-dock"><div className="tn-dock-inner">
        {open
          ? <Link className="ui-btn ui-btn-primary" href={`/tournaments/${tournament.id}?step=team`}>{fee ? t('register', { fee }) : t('registerFree')}</Link>
          : <p className="tn-dock-status" role="status">{finished ? t('finished') : t('closed')}</p>}
        {!finished && <p className="tn-dock-hint">{t('athleteHint')} <Link href="/team-members">{t('athleteLink')}</Link></p>}
      </div></div>
    </main>
  )
}
