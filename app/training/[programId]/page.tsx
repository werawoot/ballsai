import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChevronRight, Lock, ShieldCheck, Users } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchAthleteAge } from '@/lib/athlete-private'
import { CONTENT_REVIEW, TRAINING_SOURCES, canSelfStart, coachDrills, drillImage, getProgram, partnerDrills, say, sessionDrills } from '@/lib/training/content'
import { fetchMyTraining } from '@/lib/training/data'
import '../training.css'

// One programme: what it is, every exercise with our own picture, and where it comes
// from. One primary action at the thumb: start, go to today's session, or sign in.

export default async function ProgramPage(props: { params: Promise<{ programId: string }> }) {
  const { programId } = await props.params
  const program = getProgram(programId)
  if (!program) notFound()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [t, locale, athlete, age, mine] = await Promise.all([
    getTranslations('training'),
    getLocale(),
    user ? supabase.from('athlete_profiles').select('user_id').eq('user_id', user.id).maybeSingle() : null,
    user ? fetchAthleteAge(supabase, user.id) : null,
    user ? fetchMyTraining(supabase, user.id) : null,
  ])
  const isAthlete = Boolean(athlete?.data)
  const enrollment = mine?.enrollments.find(item => item.program_id === program.id)
  const solo = sessionDrills(program), partner = partnerDrills(program), coach = coachDrills(program)
  const locked = !canSelfStart(program, age)
  const drillRow = (id: string, name: string, dose: string, isLocked = false) => <li key={id}>
    <Link className={`tr-drill${isLocked ? ' is-locked' : ''}`} href={`/training/drills/${id}`}>
      <Image alt="" height={62} src={drillImage(id)} unoptimized width={82} />
      <div><b>{name}</b><small>{dose}</small></div>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  </li>

  return (
    <main className="bds-page tr">
      <PageHeader back={{ href: `/training?band=${program.band}`, label: t('back') }} />
      <div className="tr-hero ui-dark">
        <span className="tr-hero-img"><Image alt="" fill priority sizes="100vw" src={drillImage(program.cover)} unoptimized /></span>
        <div className="tr-hero-inner">
          <div className="tr-chips">
            {CONTENT_REVIEW === 'draft' && <span className="ui-chip is-warn">{t('draft')}</span>}
            <span className="ui-chip is-self">{t(`bands.${program.band}`)}</span>
            <span className="ui-chip is-self">{t(`access.${program.access}`)}</span>
          </div>
          <small className="tr-code">{program.code.toUpperCase()}</small>
          <h1>{say(program.title, locale)}</h1>
          <p>{say(program.goal, locale)}</p>
        </div>
      </div>

      <div className="tr-wrap">
        <div className="tr-facts">
          <div className="tr-fact"><b>{program.weeks}</b><small>{t('weeksLabel')}</small></div>
          <div className="tr-fact"><b>{program.perWeek}</b><small>{t('perWeekLabel')}</small></div>
          <div className="tr-fact"><b>{program.minutes}</b><small>{t('minutesLabel')}</small></div>
        </div>

        {locked
          ? <section className="tr-section"><div className="tr-locked"><Lock size={18} aria-hidden="true" /><span><b>{t('coachOnly')}</b>{t('coachOnlyText')}</span></div></section>
          : <>
              <section className="tr-section">
                <h2>{t('drillsTitle', { count: solo.length })}</h2>
                <ol className="tr-drills">{solo.map(drill => drillRow(drill.id, say(drill.name, locale), say(drill.dose, locale)))}</ol>
              </section>
              {partner.length > 0 && <section className="tr-section">
                <h2><Users size={16} aria-hidden="true" /> {t('partnerTitle')}</h2>
                <ul className="tr-drills">{partner.map(drill => drillRow(drill.id, say(drill.name, locale), say(drill.dose, locale)))}</ul>
              </section>}
              {coach.length > 0 && <section className="tr-section">
                <h2><Lock size={16} aria-hidden="true" /> {t('coachTitle')}</h2>
                <ul className="tr-drills">{coach.map(drill => drillRow(drill.id, say(drill.name, locale), t('access.coach_guided'), true))}</ul>
              </section>}
            </>}

        <section className="tr-section">
          <h2><ShieldCheck size={16} aria-hidden="true" /> {t('sourcesTitle')}</h2>
          <p className="tr-goal">{say(program.claim, locale)}</p>
          <div className="tr-sources" style={{ marginTop: 10 }}>
            {program.sources.map(key => TRAINING_SOURCES[key]).filter(Boolean).map(source => <div className="tr-source" key={source.url}>
              <b>{source.title}</b>
              <small>{source.author} · {source.license}</small>
              <a className="tap-44" href={source.url} rel="noreferrer" target="_blank">{t('drill.open')} ↗</a>
            </div>)}
          </div>
          <p className="tr-official">{t('notOfficial')}</p>
        </section>
      </div>

      {!locked && <div className="tr-dock"><div className="tr-dock-inner">
        {!user
          ? <Link className="ui-btn ui-btn-primary" href={`/login?next=${encodeURIComponent(`/training/${program.id}`)}`}>{t('signInToStart')}</Link>
          : !isAthlete
            ? <><p className="tr-dock-hint">{t('needAthlete')}</p><Link className="ui-btn ui-btn-ghost" href="/profile">{t('needAthleteCta')}</Link></>
            : enrollment
              ? <Link className="ui-btn ui-btn-primary" href={`/training/${program.id}/session`}>{t('goToday')}</Link>
              : mine && !mine.available
                ? <p className="tr-dock-hint" role="status">{t('notReady')}</p>
                : <Link className="ui-btn ui-btn-primary" href={`/training/${program.id}/start`}>{t('start')}</Link>}
        <p className="tr-dock-hint">{t('painStop')}</p>
      </div></div>}
    </main>
  )
}
