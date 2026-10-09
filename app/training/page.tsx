import Link from 'next/link'
import Image from 'next/image'
import { getLocale, getTranslations } from 'next-intl/server'
import { Lock, TriangleAlert } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchAthleteAge } from '@/lib/athlete-private'
import { ACTIVE_SEASON } from '@/lib/season'
import { CONTENT_REVIEW, bandForAge, drillImage, programsForBand, say, type Band } from '@/lib/training/content'
import { fetchMyTraining } from '@/lib/training/data'
import './training.css'

// /training: the programmes for one age band (docs/training-flow-v1.md). Anyone can read
// them; starting one needs a signed-in athlete. The band opens on the athlete's own age.

const BANDS: Band[] = ['u10_u13', 'u14_u17']

export default async function TrainingPage(props: { searchParams: Promise<{ band?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [t, locale, age, mine] = await Promise.all([
    getTranslations('training'),
    getLocale(),
    user ? fetchAthleteAge(supabase, user.id) : null,
    user ? fetchMyTraining(supabase, user.id) : null,
  ])
  const ownBand = bandForAge(age)
  const band: Band = BANDS.includes(searchParams.band as Band) ? searchParams.band as Band : ownBand ?? 'u10_u13'
  const enrolled = new Set(mine?.enrollments.map(item => item.program_id))

  return (
    <main className="bds-page tr ui-matchday">
      <PageHeader back={{ href: '/profile', label: t('back') }} />
      <div className="tr-wrap">
        <p className="ui-eyebrow">{t('eyebrow', { season: ACTIVE_SEASON })}</p>
        <h1 className="ui-h1 tr-title">{t('title')}</h1>
        <p className="tr-intro">{t('intro')}</p>
        <nav className="tr-bands" aria-label={t('bandLabel')}>
          {BANDS.map(item => <Link aria-current={item === band ? 'page' : undefined} className={item === band ? 'is-on' : ''} href={`/training?band=${item}`} key={item}>
            {item === ownBand ? t('yourBand', { band: t(`bands.${item}`) }) : t(`bands.${item}`)}
          </Link>)}
        </nav>
        {CONTENT_REVIEW === 'draft' && <p className="tr-note"><TriangleAlert size={16} aria-hidden="true" /><span>{t('draftNote')}</span></p>}
        {mine && !mine.available && <p className="tr-note" role="status">{t('notReady')}</p>}

        <div className="tr-grid">
          {programsForBand(band).map(program => {
            const locked = program.access !== 'solo'
            return <Link className={`tr-card${locked ? ' is-locked' : ''}`} href={`/training/${program.id}`} key={program.id}>
              <div className="tr-cover">
                <Image alt="" fill sizes="(max-width: 760px) 100vw, 480px" src={drillImage(program.cover)} unoptimized />
                {locked && <span className="tr-lock"><Lock size={13} aria-hidden="true" />{t('coachOnly')}</span>}
                <span className="tr-cover-text"><small>{program.code.toUpperCase()}</small><b>{say(program.title, locale)}</b></span>
              </div>
              <div className="tr-card-body">
                <div className="tr-meta"><span>{t('weeks', { count: program.weeks })}</span><span>{t('perWeek', { count: program.perWeek })}</span><span>{t('minutes', { count: program.minutes })}</span></div>
                <p className="tr-goal">{say(program.goal, locale)}</p>
                <div className="tr-chips">
                  {enrolled.has(program.id) && <span className="ui-chip is-performance">{t('enrolled')}</span>}
                  {CONTENT_REVIEW === 'draft' && <span className="ui-chip is-warn">{t('draft')}</span>}
                  <span className={`ui-chip ${locked ? 'is-self' : 'is-coach'}`}>{t(`access.${program.access}`)}</span>
                  <span className="ui-chip is-self">{t('evidence')}</span>
                </div>
              </div>
            </Link>
          })}
        </div>
      </div>
    </main>
  )
}
