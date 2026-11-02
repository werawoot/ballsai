import Link from 'next/link'
import Image from 'next/image'
import { useLocale, useTranslations } from 'next-intl'
import { ChevronRight, Dumbbell } from 'lucide-react'
import { drillImage, say } from '@/lib/training/content'
import type { TrainingHome } from '@/lib/training/home'
import { tournamentDateRange } from '@/lib/tournament-dates'
import '@/app/training/training.css'

// "โปรแกรมวันนี้" on the athlete's home (docs/training-flow-v1.md; DOENSAI dashboard design,
// owner 2 Nov 2026): today's session of the athlete's most recent programme with one button,
// or the programme to pick for their age. The week itself is WeekProgress. What the card shows
// is decided in lib/training/home.ts, which also says whether it carries the page's primary
// button. Hidden until SQL63 is applied.
export default function TrainingCard({ home, age }: { home: TrainingHome; age: number | null }) {
  const t = useTranslations('training')
  const p = useTranslations('profileHome.today')
  const locale = useLocale()
  if (home.state === 'hidden') return null

  if (home.state === 'pick') return <section className="tr-today pf-card" aria-labelledby="tr-today-title">
    <div className="tr-today-empty">
      <Dumbbell size={28} aria-hidden="true" />
      <div>
        <h2 className="tr-today-title pf-card-title" id="tr-today-title">{t('card.emptyTitle')}</h2>
        <p>{t('card.emptyText')}</p>
        {home.recommended && age !== null && <p className="tr-reco">{t('card.recommended', { age, title: say(home.recommended.title, locale) })}</p>}
      </div>
    </div>
    <Link className="ui-btn ui-btn-primary" href="/training">{t('card.pickCta')}<ChevronRight size={18} aria-hidden="true" /></Link>
  </section>

  const { program, progress } = home
  const title = progress.doneToday ? p('done') : progress.today ? p('title') : p('rest')
  return <section className="tr-today pf-card" aria-labelledby="tr-today-title">
    <div className="tr-today-head">
      <h2 className="tr-today-title pf-card-title" id="tr-today-title">{title}</h2>
      {home.needsAction && <Link className="ui-btn ui-btn-primary tr-start" href={`/training/${program.id}/session`}>{p('start')}</Link>}
    </div>
    <Link className="tr-program-row" href={`/training/${program.id}`}>
      <Image alt="" height={64} src={drillImage(program.cover)} unoptimized width={86} />
      <span className="tr-program-text">
        <b>{say(program.title, locale)}</b>
        <small>{p('meta', { minutes: program.minutes, week: progress.week, weeks: program.weeks })}</small>
        {!home.needsAction && <small>{progress.next ? t('card.nextOn', { date: tournamentDateRange(locale, progress.next) }) : t('card.ctaRest')}</small>}
      </span>
      <ChevronRight size={18} aria-hidden="true" />
    </Link>
  </section>
}
