import Link from 'next/link'
import Image from 'next/image'
import { Kaushan_Script } from 'next/font/google'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowRightLeft, BookOpenCheck, CalendarDays, ChartColumn, ChevronRight, CircleDot, Dumbbell, Footprints, Goal, Lock, MapPinned, Repeat, Route, Shapes, ShieldPlus, TriangleAlert, type LucideIcon } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchAthleteAge } from '@/lib/athlete-private'
import { CONTENT_REVIEW, TRAINING_PROGRAMS, bandForAge, drillImage, programsForBand, say, type Band } from '@/lib/training/content'
import { drillsForBand, isSkill, skillsForBand, type Skill } from '@/lib/training/skills'
import { fetchMyTraining } from '@/lib/training/data'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import './training-glass.css'

// /training in the light glass design (owner's mockup, 24 Oct 2026; ADR-014): a head over a
// real pitch photo with the age bands, three cards that say only what is true, then the
// band's programmes and its drills by skill. Anyone can read them; starting one needs a
// signed-in athlete. The band opens on the athlete's own age (docs/training-flow-v1.md).

const BANDS: Band[] = ['u10_u13', 'u14_u17']
const SKILL_ICONS: Record<Skill | 'all', LucideIcon> = { all: Shapes, control: CircleDot, dribble: Route, shoot: Goal, pass: ArrowRightLeft, movement: Footprints, fitness: Dumbbell, injury: ShieldPlus }
const FEATURES = [['age', ChartColumn], ['source', BookOpenCheck], ['anywhere', MapPinned]] as const
const script = Kaushan_Script({ weight: '400', subsets: ['latin'], display: 'swap' })
// The range an athlete can start alone; a coach-guided programme is not counted.
const sessionMinutes = TRAINING_PROGRAMS.filter(program => program.access === 'solo').map(program => program.minutes)

export default async function TrainingPage(props: { searchParams: Promise<{ band?: string; skill?: string }> }) {
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
  const skills = skillsForBand(band)
  const skill: Skill | null = isSkill(searchParams.skill) && skills.includes(searchParams.skill) ? searchParams.skill : null
  const drills = drillsForBand(band, skill ?? undefined)
  const enrolled = new Set(mine?.enrollments.map(item => item.program_id))
  const href = (next: { band?: Band; skill?: Skill | null }) => {
    const params = new URLSearchParams({ band: next.band ?? band })
    const nextSkill = next.skill === undefined ? skill : next.skill
    if (nextSkill) params.set('skill', nextSkill)
    return `/training?${params}`
  }

  return (
    <main className="bds-page tg gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.training)}>
      <PageHeader back={{ href: '/profile', label: t('back') }} />
      <section className="tg-hero gl-on-photo">
        <div className="tg-hero-inner">
          <div className="tg-hero-copy">
            <p className={`tg-tagline ${script.className}`} lang="en">{t('tagline')}</p>
            <h1>{t('title')}</h1>
            <p className="tg-lead">{t('heroLead')}</p>
            <nav className="tg-bands" aria-label={t('bandLabel')}>
              {BANDS.map(item => <Link aria-current={item === band ? 'page' : undefined} className={item === band ? 'is-on' : undefined} href={href({ band: item, skill: null })} key={item}>
                {item === ownBand ? t('yourBand', { band: t(`bands.${item}`) }) : t(`bands.${item}`)}
              </Link>)}
            </nav>
          </div>
          <ul className="tg-features" aria-label={t('featuresLabel')}>
            {FEATURES.map(([key, Icon]) => <li key={key}>
              <span className="tg-feature-icon" aria-hidden="true"><Icon size={24} /></span>
              <span><b>{t(`features.${key}.title`)}</b><small>{t(`features.${key}.body`, { min: Math.min(...sessionMinutes), max: Math.max(...sessionMinutes) })}</small></span>
            </li>)}
          </ul>
        </div>
      </section>

      <div className="tg-body">
        <div className="tg-panel">
          <nav className="tg-skills" aria-label={t('skillsLabel')}>
            {(['all', ...skills] as const).map(item => {
              const Icon = SKILL_ICONS[item]
              const on = (item === 'all' && !skill) || item === skill
              return <Link aria-current={on ? 'true' : undefined} className={on ? 'is-on' : undefined} href={href({ skill: item === 'all' ? null : item })} key={item} scroll={false}>
                <Icon size={22} aria-hidden="true" /><span>{t(`skills.${item}`)}</span>
              </Link>
            })}
          </nav>

          {CONTENT_REVIEW === 'draft' && <p className="tg-note"><TriangleAlert size={16} aria-hidden="true" /><span>{t('draftNote')}</span></p>}
          {mine && !mine.available && <p className="tg-note" role="status">{t('notReady')}</p>}

          <h2 className="tg-h2">{t('programsTitle', { band: t(`bands.${band}`) })}</h2>
          <div className="tg-programs">
            {programsForBand(band).map(program => {
              const locked = program.access !== 'solo'
              return <Link className={`tg-program${locked ? ' is-locked' : ''}`} href={`/training/${program.id}`} key={program.id}>
                <div className="tg-cover">
                  <Image alt="" fill sizes="(max-width: 760px) 100vw, 360px" src={drillImage(program.cover)} unoptimized />
                  <span className="tg-time">{t('minutes', { count: program.minutes })}</span>
                  {locked && <span className="tg-lock"><Lock size={13} aria-hidden="true" />{t('coachOnly')}</span>}
                </div>
                <div className="tg-program-body">
                  <div className="tg-chips">
                    <span className="tg-chip is-band">{t(`bands.${program.band}`)}</span>
                    {enrolled.has(program.id) && <span className="tg-chip is-on">{t('enrolled')}</span>}
                    {CONTENT_REVIEW === 'draft' && <span className="tg-chip is-warn">{t('draft')}</span>}
                  </div>
                  <b className="tg-program-title">{say(program.title, locale)}</b>
                  <p className="tg-goal">{say(program.goal, locale)}</p>
                  <div className="tg-meta">
                    <span><CalendarDays size={15} aria-hidden="true" />{t('weeks', { count: program.weeks })}</span>
                    <span><Repeat size={15} aria-hidden="true" />{t('perWeek', { count: program.perWeek })}</span>
                  </div>
                  <div className="tg-chips">
                    <span className={`tg-chip ${locked ? 'is-self' : 'is-coach'}`}>{t(`access.${program.access}`)}</span>
                    <span className="tg-chip is-self">{t('evidence')}</span>
                  </div>
                </div>
              </Link>
            })}
          </div>

          <div className="tg-drills-head">
            <h2 className="tg-h2">{t('skillDrillsTitle')} · {t(`skills.${skill ?? 'all'}`)}</h2>
            <span>{t('skillDrillsCount', { count: drills.length })}</span>
          </div>
          <ul className="tg-drills">
            {drills.map(({ drill }) => <li key={drill.id}>
              <Link href={`/training/drills/${drill.id}`}>
                <span className="tg-drill-img"><Image alt="" fill sizes="104px" src={drillImage(drill.id)} unoptimized /></span>
                <span className="tg-drill-text"><b>{say(drill.name, locale)}</b><small>{say(drill.dose, locale)}</small></span>
                <ChevronRight className="tg-drill-go" size={20} aria-hidden="true" />
              </Link>
            </li>)}
          </ul>
        </div>
      </div>
    </main>
  )
}
