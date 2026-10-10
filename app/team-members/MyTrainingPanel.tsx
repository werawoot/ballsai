import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Dumbbell } from 'lucide-react'
import type { PlanDay, Weekday } from '@/lib/team-training'
import './team-page.css'

export type MyPlanRow = { team_id: string; team_name: string; week_start: string; days: PlanDay[] }

// The athlete's and the guardian's side of the team plan (sql/72, my_team_training_plans):
// this week's plan of each team, today marked; a library drill links to its how-to page.
// Days already past are left out; next week's plan shows once this week has none left.
export default function MyTrainingPanel({ rows, thisWeek, today }: { rows: MyPlanRow[]; thisWeek: string; today: Weekday }) {
  const t = useTranslations('teamTraining')
  if (!rows.length) return null
  // This week from today on; once it has nothing left, next week's plan.
  const shown = rows.filter(row => row.week_start === thisWeek)
    .map(row => ({ ...row, days: row.days.filter(day => day.day >= today) }))
    .filter(row => row.days.length)
  const plans = shown.length ? shown : rows.filter(row => row.week_start !== thisWeek)
  if (!plans.length) return null

  return (
    <section className="ui-card me-card" aria-labelledby="me-training">
      <h2 id="me-training"><Dumbbell size={17} aria-hidden="true" /> {t('myTitle')}</h2>
      <p className="tp-note">{t('myRule')}</p>
      {plans.map(plan => <article className="me-item" key={`${plan.team_id}-${plan.week_start}`}>
        <span className="me-for">{t('fromTeam', { team: plan.team_name })} · {plan.week_start === thisWeek ? t('thisWeek') : t('nextWeek')}</span>
        {plan.days.map(day => {
          const isToday = plan.week_start === thisWeek && day.day === today
          const minutes = day.blocks.reduce((sum, block) => sum + block.minutes, 0)
          return <div className={isToday ? 'tt-my-day is-today' : 'tt-my-day'} key={day.day}>
            <div className="te-top"><b>{t(`dayNames.${day.day}`)}{day.title ? ` · ${day.title}` : ''}</b><span className="tn-when">{isToday && <b className="tn-new">{t('today')}</b>}{t('dayTotal', { minutes })}</span></div>
            <ul>{day.blocks.map((block, index) => <li key={index}>
              {block.drill ? <Link href={`/training/drills/${block.drill}`}>{block.name}</Link> : <span>{block.name}</span>}
              <small>{t('minutes', { count: block.minutes })} · {t(`loads.${block.load}`)}</small>
            </li>)}</ul>
          </div>
        })}
      </article>)}
    </section>
  )
}
