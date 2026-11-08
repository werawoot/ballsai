import Link from 'next/link'
import Image from 'next/image'
import { Kaushan_Script } from 'next/font/google'
import { getLocale, getTranslations } from 'next-intl/server'
import { ArrowRightLeft, BookOpenCheck, CalendarDays, ChartColumn, Check, ChevronRight, CircleDot, Dumbbell, Footprints, Goal, Lock, MapPinned, Plus, Repeat, Route, Shapes, ShieldPlus, TriangleAlert, type LucideIcon } from 'lucide-react'
import PageHeader from '@/components/PageHeader'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { fetchAthleteAge, thaiDate } from '@/lib/athlete-private'
import GoalPicker from './GoalPicker'
import { fetchMyGoal } from '@/lib/training/goal-data'
import { goalFits, orderForGoal } from '@/lib/training/goals'
import { CONTENT_REVIEW, TRAINING_PROGRAMS, bandForAge, drillImage, programsForBand, say, type Band } from '@/lib/training/content'
import { drillsForBand, isSkill, skillsForBand, type Skill } from '@/lib/training/skills'
import { fetchMyTraining } from '@/lib/training/data'
import { trainingTab, trainingToday, type TrainingTab } from '@/lib/training/today'
import { tournamentDateRange } from '@/lib/tournament-dates'
import { glassSceneStyle, PAGE_PHOTOS, PROGRAM_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import './training-glass.css'

// /training in the light glass design (owner's mockup, 24 Oct 2026; ADR-014): a head over a
// real pitch photo with the age bands, three cards that say only what is true, then the
// band's programmes (each on a real photo) and its drills by skill (3D pictures, which show
// the movement). Anyone can read them; starting one needs a
// signed-in athlete. The band opens on the athlete's own age (docs/training-flow-v1.md).

const BANDS: Band[] = ['u10_u13', 'u14_u17']
const SKILL_ICONS: Record<Skill | 'all', LucideIcon> = { all: Shapes, control: CircleDot, dribble: Route, shoot: Goal, pass: ArrowRightLeft, movement: Footprints, fitness: Dumbbell, injury: ShieldPlus }
const FEATURES = [['age', ChartColumn], ['source', BookOpenCheck], ['anywhere', MapPinned]] as const
const script = Kaushan_Script({ weight: '400', subsets: ['latin'], display: 'swap' })
// The range an athlete can start alone; a coach-guided programme is not counted.
const sessionMinutes = TRAINING_PROGRAMS.filter(program => program.access === 'solo').map(program => program.minutes)

export default async function TrainingPage(props: { searchParams: Promise<{ band?: string; skill?: string; tab?: string; goal?: string }> }) {
  const searchParams = await props.searchParams
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const [t, locale, age, mine, myGoal] = await Promise.all([
    getTranslations('training'),
    getLocale(),
    user ? fetchAthleteAge(supabase, user.id) : null,
    user ? fetchMyTraining(supabase, user.id) : null,
    // The goal comes before the programme (ADR-015); null before SQL95 or when signed out.
    user ? fetchMyGoal(supabase, user.id) : null,
  ])
  const goal = myGoal?.goal ?? null
  const askGoal = Boolean(myGoal?.available) && (!goal || searchParams.goal === 'change')
  const ownBand = bandForAge(age)
  const band: Band = BANDS.includes(searchParams.band as Band) ? searchParams.band as Band : ownBand ?? 'u10_u13'
  const skills = skillsForBand(band)
  const skill: Skill | null = isSkill(searchParams.skill) && skills.includes(searchParams.skill) ? searchParams.skill : null
  const drills = drillsForBand(band, skill ?? undefined)
  const enrolled = new Set(mine?.enrollments.map(item => item.program_id))
  // "My schedule" (second reference, owner 2 Nov 2026): the week and today's programmes.
  const today = thaiDate(new Date())
  const view = mine?.available ? trainingToday(mine, today) : null
  const tab = trainingTab(searchParams.tab, Boolean(view && view.programs.length > 0))
  const tabs: TrainingTab[] = view && view.programs.length > 0 ? ['mine', 'programs', 'skills'] : ['programs', 'skills']
  const href = (next: { band?: Band; skill?: Skill | null; tab?: TrainingTab }) => {
    const params = new URLSearchParams({ band: next.band ?? band })
    const nextSkill = next.skill === undefined ? skill : next.skill
    if (nextSkill) params.set('skill', nextSkill)
    params.set('tab', next.tab ?? tab)
    return `/training?${params}`
  }
  const dateFormat = (options: Intl.DateTimeFormatOptions, day: string) => new Intl.DateTimeFormat(locale === 'th' ? 'th-TH' : 'en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
  const firstOpen = view?.today.find(item => !item.done)

  return (
    <main className="bds-page tg gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.training)}>
      <PageHeader back={{ href: '/profile', label: t('back') }} />
      <section className={`tg-hero gl-on-photo${tab === 'mine' ? ' is-compact' : ''}`}>
        <div className="tg-hero-inner">
          <div className="tg-hero-copy">
            <p className={`tg-tagline ${script.className}`} lang="en">{t('tagline')}</p>
            <h1>{t('title')}</h1>
            {tab !== 'mine' && <p className="tg-lead">{t('heroLead')}</p>}
            <nav className="tg-bands" aria-label={t('bandLabel')}>
              {BANDS.map(item => <Link aria-current={item === band ? 'page' : undefined} className={item === band ? 'is-on' : undefined} href={href({ band: item, skill: null })} key={item}>
                {item === ownBand ? t('yourBand', { band: t(`bands.${item}`) }) : t(`bands.${item}`)}
              </Link>)}
            </nav>
          </div>
          {/* My schedule opens straight on the week (second reference); the pitch for the programmes stays on the other tabs. */}
          {tab !== 'mine' && <ul className="tg-features" aria-label={t('featuresLabel')}>
            {FEATURES.map(([key, Icon]) => <li key={key}>
              <span className="tg-feature-icon" aria-hidden="true"><Icon size={24} /></span>
              <span><b>{t(`features.${key}.title`)}</b><small>{t(`features.${key}.body`, { min: Math.min(...sessionMinutes), max: Math.max(...sessionMinutes) })}</small></span>
            </li>)}
          </ul>}
        </div>
      </section>

      <div className="tg-body">
        <div className="tg-panel">
          <nav className="tg-tabs" aria-label={t('tabs.label')}>
            {tabs.map(item => <Link key={item} href={href({ tab: item })} aria-current={item === tab ? 'page' : undefined} className={item === tab ? 'is-on' : undefined} scroll={false}>{t(`tabs.${item}`)}</Link>)}
          </nav>

          {tab === 'mine' && view && <section className="tg-mine" aria-labelledby="tg-today">
            <div className="tg-month"><b>{dateFormat({ month: 'long', year: 'numeric' }, today)}</b><span>{t('my.weekLabel')}</span></div>
            <ol className="tg-weekstrip">
              {view.week.map(day => <li key={day.date} className={[day.planned && 'is-plan', day.done && 'is-done', day.isToday && 'is-today'].filter(Boolean).join(' ')} aria-current={day.isToday ? 'date' : undefined}>
                <small>{t(`schedule.days.d${day.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6}`)}</small>
                <b>{day.dayOfMonth}</b>
                <span className="tg-sr">{day.done ? t('my.dayDone') : day.planned ? t('my.dayPlanned') : t('my.dayRest')}</span>
              </li>)}
            </ol>

            <div className="tg-today-head">
              <h2 id="tg-today" className="tg-h2">{t('my.today', { date: dateFormat({ weekday: 'long', day: 'numeric', month: 'short' }, today) })}</h2>
              {view.plannedToday > 0 && <span className="tg-today-count">{t('my.progress', { done: view.doneToday, planned: view.plannedToday })}</span>}
            </div>
            {view.plannedToday === 0 ? <div className="tg-rest">
              <b>{t('my.rest')}</b><small>{t('my.restBody')}</small>
              {(() => { const next = view.programs.map(item => item.progress.next).filter((day): day is string => Boolean(day)).sort()[0]; return next ? <small>{t('my.next', { date: tournamentDateRange(locale, next) })}</small> : null })()}
            </div> : view.today.map(item => <article key={item.enrollment.id} className={`tg-session${item.done ? ' is-done' : ''}`}>
              <div className="tg-session-head">
                <Link href={`/training/${item.program.id}`} className="tg-session-title"><b>{say(item.program.title, locale)}</b><small>{t('minutes', { count: item.program.minutes })}</small></Link>
                {item.done
                  ? <span className="tg-session-done"><Check size={16} strokeWidth={3} aria-hidden="true" />{t('my.done')}</span>
                  : <Link href={`/training/${item.program.id}/session`} className={`tg-session-start${item === firstOpen ? ' is-primary' : ''}`}>{t('my.start')}</Link>}
              </div>
              <ol className="tg-timeline">
                {item.program.drills.map(drill => <li key={drill.id}>
                  <Link href={`/training/drills/${drill.id}`}>
                    <span className="tg-drill-img"><Image alt="" fill sizes="80px" src={drillImage(drill.id)} unoptimized /></span>
                    <span className="tg-drill-text"><b>{say(drill.name, locale)}</b><small>{say(drill.dose, locale)}</small></span>
                    <ChevronRight className="tg-drill-go" size={18} aria-hidden="true" />
                  </Link>
                </li>)}
              </ol>
            </article>)}
            <p className="tg-self-note">{t('my.selfNote')}</p>

            <Link href={href({ tab: 'programs' })} className={`tg-add${firstOpen ? '' : ' is-primary'}`}><Plus size={20} aria-hidden="true" />{t('my.add')}</Link>

            <h2 className="tg-h2">{t('my.myPrograms')}</h2>
            <ul className="tg-myprograms">
              {view.programs.map(item => <li key={item.enrollment.id}>
                <Link href={`/training/${item.program.id}`}>
                  <span className="tg-drill-img"><Image alt="" fill sizes="80px" src={PROGRAM_PHOTOS[item.program.id]?.src ?? drillImage(item.program.cover)} unoptimized /></span>
                  <span className="tg-drill-text"><b>{say(item.program.title, locale)}</b><small>{t('my.programLine', { done: item.progress.done, total: item.progress.total, week: item.progress.week, weeks: item.program.weeks })}</small></span>
                  <ChevronRight className="tg-drill-go" size={18} aria-hidden="true" />
                </Link>
              </li>)}
            </ul>
          </section>}

          {tab === 'skills' && <nav className="tg-skills" aria-label={t('skillsLabel')}>
            {(['all', ...skills] as const).map(item => {
              const Icon = SKILL_ICONS[item]
              const on = (item === 'all' && !skill) || item === skill
              return <Link aria-current={on ? 'true' : undefined} className={on ? 'is-on' : undefined} href={href({ skill: item === 'all' ? null : item })} key={item} scroll={false}>
                <Icon size={22} aria-hidden="true" /><span>{t(`skills.${item}`)}</span>
              </Link>
            })}
          </nav>}

          {CONTENT_REVIEW === 'draft' && <p className="tg-note"><TriangleAlert size={16} aria-hidden="true" /><span>{t('draftNote')}</span></p>}
          {mine && !mine.available && <p className="tg-note" role="status">{t('notReady')}</p>}

          {tab === 'programs' && <>
          {askGoal && <GoalPicker current={goal} />}
          {!askGoal && goal && <p className="tg-goal-now">
            <span className="tg-chip is-on">{t('goals.current', { goal: t(`goals.options.${goal}.label`) })}</span>
            <Link href="/training?tab=programs&goal=change">{t('goals.change')}</Link>
          </p>}
          <h2 className="tg-h2">{t('programsTitle', { band: t(`bands.${band}`) })}</h2>
          <div className="tg-programs">
            {orderForGoal(programsForBand(band), goal).map(program => {
              const locked = program.access !== 'solo'
              return <Link className={`tg-program${locked ? ' is-locked' : ''}`} href={`/training/${program.id}`} key={program.id}>
                <div className="tg-cover">
                  <Image alt="" fill sizes="(max-width: 760px) 100vw, 360px" src={PROGRAM_PHOTOS[program.id]?.src ?? drillImage(program.cover)} unoptimized />
                  <span className="tg-time">{t('minutes', { count: program.minutes })}</span>
                  {locked && <span className="tg-lock"><Lock size={13} aria-hidden="true" />{t('coachOnly')}</span>}
                </div>
                <div className="tg-program-body">
                  <div className="tg-chips">
                    <span className="tg-chip is-band">{t(`bands.${program.band}`)}</span>
                    {enrolled.has(program.id) && <span className="tg-chip is-on">{t('enrolled')}</span>}
                    {goal && goal !== 'consistency' && goalFits(program.id, goal) && <span className="tg-chip is-on">{t('goals.match')}</span>}
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
          </>}

          {tab === 'skills' && <>
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
          </>}
        </div>
      </div>
    </main>
  )
}
