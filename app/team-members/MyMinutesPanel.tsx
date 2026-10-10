import { useTranslations } from 'next-intl'
import { Timer } from 'lucide-react'
import './team-page.css'

export type MyMinutesRow = { team_id: string; team_name: string; athlete_id: string; athlete_name: string; matches: number; starts: number; minutes: number }

// The athlete's and the guardian's season minutes per team (sql/74, my_match_minutes),
// labelled as the coach's record (AGENTS.md rule 8), not a verified performance.
export default function MyMinutesPanel({ rows, viewerId }: { rows: MyMinutesRow[]; viewerId: string }) {
  const t = useTranslations('matchMinutes')
  if (!rows.length) return null
  return (
    <section className="ui-card me-card" aria-labelledby="me-minutes">
      <div className="te-top"><h2 id="me-minutes"><Timer size={17} aria-hidden="true" /> {t('myTitle')}</h2><span className="ui-chip is-coach">{t('source')}</span></div>
      {rows.map(row => <article className="me-item" key={`${row.team_id}-${row.athlete_id}`}>
        <span className="me-for">{t('fromTeam', { team: row.team_name })}{row.athlete_id !== viewerId ? ` · ${t('forAthlete', { name: row.athlete_name || '—' })}` : ''}</span>
        <b className="te-title">{t('myLine', { minutes: row.minutes, matches: row.matches, starts: row.starts })}</b>
      </article>)}
      <p className="tp-note">{t('rule')}</p>
    </section>
  )
}
