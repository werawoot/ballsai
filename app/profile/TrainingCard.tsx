import Link from 'next/link'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { drillImage, say } from '@/lib/training/content'
import type { TrainingHome } from '@/lib/training/home'
import { tournamentDateRange } from '@/lib/tournament-dates'
import '@/app/training/training.css'

// The entry to /training on /profile (docs/training-flow-v1.md): today's session for the
// athlete's most recent programme, the week at a glance, and one button. Without a
// programme it asks them to pick one, naming the one that fits their age. What the card shows
// is decided in lib/training/home.ts, which also says whether it carries the page's primary
// button. Hidden until SQL63 is applied.
export default function TrainingCard({ home, age }: { home: TrainingHome; age: number | null }) {
  const t = useTranslations('training')
  const locale = useLocale()
  if (home.state === 'hidden') return null

  if (home.state === 'pick') return <section className="tr-today" aria-labelledby="tr-today-title">
    <div className="tr-today-empty">
      <Dumbbell size={28} aria-hidden="true" />
      <div>
        <b className="tr-today-title" id="tr-today-title">{t('card.emptyTitle')}</b>
        <p>{t('card.emptyText')}</p>
        {home.recommended && age !== null && <p className="tr-reco">{t('card.recommended', { age, title: say(home.recommended.title, locale) })}</p>}
      </div>
    </div>
    <Link className="ui-btn ui-btn-primary" href="/training">{t('card.pickCta')}<ChevronRight size={18} aria-hidden="true" /></Link>
  </section>

  const { program, progress } = home
  const eyebrow = progress.doneToday ? 'card.eyebrowDone' : progress.today ? 'card.eyebrow' : 'card.eyebrowRest'
  return <section className="tr-today" aria-labelledby="tr-today-title">
    <div className="tr-today-top">
      <Image alt="" height={64} src={drillImage(program.cover)} unoptimized width={86} />
      <div>
        <small className="tr-eyebrow">{t(eyebrow, { week: progress.week, weeks: program.weeks })}</small>
        <b className="tr-today-title" id="tr-today-title">{say(program.title, locale)}</b>
        <p>{progress.streakWeeks > 0 ? t('card.progress', { done: progress.done, total: progress.total, streak: progress.streakWeeks }) : t('card.progressNoStreak', { done: progress.done, total: progress.total })}</p>
      </div>
    </div>
    <ol className="tr-week" aria-hidden="true">
      {progress.thisWeek.map(day => <li className={[day.planned && 'is-plan', day.done && 'is-done', day.isToday && day.planned && 'is-today'].filter(Boolean).join(' ')} key={day.date}>{t(`schedule.days.d${day.weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6}`)}</li>)}
    </ol>
    {progress.today && !progress.doneToday
      ? <Link className="ui-btn ui-btn-primary" href={`/training/${program.id}/session`}>{t('card.cta')}</Link>
      : <Link className="ui-btn ui-btn-ghost-d" href={`/training/${program.id}`}>{progress.next ? t('card.nextOn', { date: tournamentDateRange(locale, progress.next) }) : t('card.ctaRest')}</Link>}
  </section>
}
