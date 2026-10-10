'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { MapPin } from 'lucide-react'
import { eventTimeParts } from '@/lib/team-events'
import { useApiErrorText } from '@/lib/use-api-error-text'
import './team-page.css'

export type MyEventRow = {
  event_id: string; team_name: string; kind: 'training' | 'match'; title: string; starts_at: string
  location: string | null; athlete_id: string; athlete_name: string; answer: 'yes' | 'no' | null
}

// The athlete's and the guardian's side of team events (sql/70, my_upcoming_team_events):
// one row per upcoming event and child, "can come" / "can't come". The answer can change
// until the start; the database checks the caller is the athlete or their guardian.
export default function MyEventsPanel({ rows, viewerId }: { rows: MyEventRow[]; viewerId: string }) {
  const t = useTranslations('teamEvents')
  const errorText = useApiErrorText()
  const when = (iso: string) => { const at = eventTimeParts(iso); return t('when', { ...at, weekday: t(`weekdays.${at.weekday}`) }) }
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!rows.length) return null

  const respond = async (row: MyEventRow, answer: 'yes' | 'no') => {
    if (busy) return
    setBusy(`${row.event_id}:${row.athlete_id}`); setMessage(null)
    const response = await fetch('/api/team-events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond', data: { id: row.event_id, athleteId: row.athlete_id, answer } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(null)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('answerFailed')) }); return }
    setMessage({ tone: 'ok', text: t('answered', { answer: t(answer) }) })
    router.refresh()
  }

  return (
    <section className="ui-card me-card" aria-labelledby="me-events">
      <h2 id="me-events">{t('myTitle')}</h2>
      <p className="tp-note">{t('myRule')}</p>
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      {rows.map(row => {
        const key = `${row.event_id}:${row.athlete_id}`
        return <article className="me-item" key={key}>
          <div className="te-top"><span className={`te-kind is-${row.kind}`}>{t(`kinds.${row.kind}`)}</span><time dateTime={row.starts_at}>{when(row.starts_at)}</time></div>
          <b className="te-title">{row.title}</b>
          <span className="te-place">{row.team_name}</span>
          {row.location && <span className="te-place"><MapPin size={14} aria-hidden="true" />{row.location}</span>}
          {row.athlete_id !== viewerId && <span className="me-for">{t('forAthlete', { name: row.athlete_name || '—' })}</span>}
          <div className="me-answers" role="group" aria-label={row.title}>
            {(['yes', 'no'] as const).map(answer => <button type="button" key={answer}
              className={`ui-btn ui-btn-sm ${row.answer === answer ? 'ui-btn-primary is-chosen' : 'ui-btn-ghost'}`}
              aria-pressed={row.answer === answer} disabled={Boolean(busy)} onClick={() => respond(row, answer)}>
              {busy === key ? '…' : t(answer)}
            </button>)}
          </div>
        </article>
      })}
    </section>
  )
}
