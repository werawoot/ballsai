import Link from 'next/link'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { drillImage, getProgram, say } from '@/lib/training/content'
import type { MyTraining } from '@/lib/training/data'
import { trainingProgress } from '@/lib/training/schedule'
import { tournamentDateRange } from '@/lib/tournament-dates'
import '@/app/training/training.css'

// The entry to /training on /profile (docs/training-flow-v1.md): today's session for the
// athlete's most recent programme, the week at a glance, and one button. Without a
// programme it invites them to pick one. Hidden until SQL63 is applied.
export default function TrainingCard({ training, today }: { training: MyTraining; today: string }) {
  const t = useTranslations('training')
  const locale = useLocale()
  if (!training.available) return null
  const enrollment = training.enrollments.find(item => getProgram(item.program_id))
  const program = enrollment ? getProgram(enrollment.program_id) : null

  if (!enrollment || !program) return <Link className="tr-today" href="/training">
    <div className="tr-today-empty">
      <Dumbbell size={28} aria-hidden="true" />
      <div><b className="tr-today-title">{t('card.emptyTitle')}</b><p>{t('card.emptyText')}</p></div>
      <ChevronRight size={20} aria-hidden="true" />
    </div>
  </Link>

  const progress = trainingProgress({ start: enrollment.start_date, weekdays: enrollment.weekdays, weeks: program.weeks, checkins: training.checkins[enrollment.id] ?? [], today })
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
