'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Flag, NotebookPen, Trash2 } from 'lucide-react'
import type { NoteCategory } from '@/lib/coach-notes'
import { eventTimeParts } from '@/lib/team-events'
import { useApiErrorText } from '@/lib/use-api-error-text'
import './team-page.css'

export type MyNoteRow = {
  id: string; team_name: string; athlete_id: string; athlete_name: string; category: NoteCategory
  body: string; created_at: string; expires_at: string; reported: boolean
}

// The athlete's and the guardian's side of coach notes (sql/73, my_coach_notes): every
// note about them, who it is about and when it deletes itself, with delete (erasure) and
// report. Nothing about a child is hidden from the child or their guardian.
export default function MyCoachNotesPanel({ rows, viewerId }: { rows: MyNoteRow[]; viewerId: string }) {
  const t = useTranslations('coachNotes')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!rows.length) return null

  const when = (iso: string) => { const at = eventTimeParts(iso); return t('when', { day: at.day, month: at.month }) }
  // The expiry is a year away: say which year.
  const until = (iso: string) => `${when(iso)}/${new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).getUTCFullYear()}`
  const act = async (action: 'delete' | 'report', id: string) => {
    if (busy || (action === 'delete' && !window.confirm(t('deleteConfirm')))) return
    setBusy(`${action}:${id}`); setMessage(null)
    const response = await fetch('/api/coach-notes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data: { id } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(null)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, action === 'delete' ? t('deleteFailed') : t('reportFailed')) }); return }
    setMessage({ tone: 'ok', text: action === 'delete' ? t('deleted') : t('reported') })
    router.refresh()
  }

  return (
    <section className="ui-card me-card" aria-labelledby="me-notes">
      <h2 id="me-notes"><NotebookPen size={17} aria-hidden="true" /> {t('myTitle')}</h2>
      <p className="tp-note">{t('myNotice')}</p>
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      {rows.map(row => <article className="me-item" key={row.id}>
        <div className="te-top"><span className="te-kind is-training">{t(`categories.${row.category}`)}</span><span className="tn-when">{t('fromTeam', { team: row.team_name })} · {when(row.created_at)}</span></div>
        {row.athlete_id !== viewerId && <span className="me-for">{t('forAthlete', { name: row.athlete_name || '—' })}</span>}
        <p className="tn-body">{row.body}</p>
        <div className="tn-meta">
          <span>{row.reported ? t('reported') : t('expires', { date: until(row.expires_at) })}</span>
          <span className="te-actions">
            {!row.reported && <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={Boolean(busy)} onClick={() => act('report', row.id)}><Flag size={14} aria-hidden="true" />{t('report')}</button>}
            <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={Boolean(busy)} onClick={() => act('delete', row.id)}><Trash2 size={14} aria-hidden="true" />{t('delete')}</button>
          </span>
        </div>
      </article>)}
    </section>
  )
}
