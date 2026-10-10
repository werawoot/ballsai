'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Save, Trash2 } from 'lucide-react'
import { NOTE_CATEGORIES, NOTE_MAX, healthWord, type NoteCategory } from '@/lib/coach-notes'
import { eventTimeParts } from '@/lib/team-events'
import { useApiErrorText } from '@/lib/use-api-error-text'

type Member = { athleteId: string; name: string }
export type CoachNote = { id: string; athleteId: string; category: NoteCategory; body: string; createdAt: string; expiresAt: string }

const post = async (action: string, data: Record<string, unknown>) => {
  const response = await fetch('/api/coach-notes', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }),
  }).catch(() => null)
  return { ok: Boolean(response?.ok), body: response ? await response.json().catch(() => null) : null }
}

// The coach's side of athlete notes (sql/73, docs/research/coach-notes-pdpa-2026-10-10.md):
// pick a member and a category, write up to 280 characters. The athlete and guardian see
// every note; health words are refused before saving. The id is kept per draft, so a
// retried save is the same note.
export default function CoachNotesPanel({ teamId, members, notes, ready }: { teamId: string; members: Member[]; notes: CoachNote[]; ready: boolean }) {
  const t = useTranslations('coachNotes')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [who, setWho] = useState(members[0]?.athleteId ?? '')
  const [draft, setDraft] = useState<{ id: string; category: NoteCategory; body: string }>({ id: '', category: 'technical', body: '' })
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!members.length) return null
  if (!ready) return <p className="tp-empty">{t('notReady')}</p>

  const when = (iso: string) => { const at = eventTimeParts(iso); return t('when', { day: at.day, month: at.month }) }
  // The expiry is a year away: say which year.
  const until = (iso: string) => `${when(iso)}/${new Date(Date.parse(iso) + 7 * 60 * 60 * 1000).getUTCFullYear()}`
  const text = draft.body.trim()
  const word = text ? healthWord(text) : null
  const canSave = Boolean(text) && text.length <= NOTE_MAX && !word && !busy
  const mine = notes.filter(note => note.athleteId === who)

  const edit = (update: Partial<typeof draft>) => { setDraft(current => ({ ...current, ...update, id: '' })); setMessage(null) }
  const save = async () => {
    if (!canSave) return
    const id = draft.id || crypto.randomUUID()
    setDraft(current => ({ ...current, id }))
    setBusy('save'); setMessage(null)
    const result = await post('write', { id, teamId, athleteId: who, category: draft.category, body: text })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('saveFailed')) }); return }
    setDraft({ id: '', category: draft.category, body: '' })
    setMessage({ tone: 'ok', text: t('saved') })
    router.refresh()
  }
  const remove = async (id: string) => {
    if (busy || !window.confirm(t('deleteConfirm'))) return
    setBusy(`delete:${id}`); setMessage(null)
    const result = await post('delete', { id })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('deleteFailed')) }); return }
    setMessage({ tone: 'ok', text: t('deleted') })
    router.refresh()
  }

  return (
    <div className="te">
      <div className="ui-card te-form">
        <div className="tp-chips" role="group" aria-label={t('pickAthlete')}>
          {members.map(member => <button type="button" key={member.athleteId} className={member.athleteId === who ? 'is-on' : undefined} aria-pressed={member.athleteId === who}
            onClick={() => { setWho(member.athleteId); edit({ body: '' }) }}>{member.name}</button>)}
        </div>
        <div className="tp-chips is-wrap" role="group" aria-label={t('category')}>
          {NOTE_CATEGORIES.map(category => <button type="button" key={category} className={draft.category === category ? 'is-on' : undefined} aria-pressed={draft.category === category}
            onClick={() => edit({ category })}>{t(`categories.${category}`)}</button>)}
        </div>
        <label>{t('label')}<textarea value={draft.body} maxLength={NOTE_MAX} rows={3} placeholder={t('placeholder')} onChange={event => edit({ body: event.target.value })} /></label>
        <small className="tn-length">{t('length', { count: draft.body.length })}</small>
        {word && <p className="tp-alert" role="alert">{t('healthWarning', { word })}</p>}
        <p className="tp-note">{t('notice')}</p>
        {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        <button type="button" className="ui-btn ui-btn-primary" disabled={!canSave} onClick={save}><Save size={16} aria-hidden="true" />{busy === 'save' ? t('saving') : t('save')}</button>
      </div>

      <h3 className="te-sub">{t('history')}</h3>
      {mine.length
        ? mine.map(note => <article className="ui-card te-card" key={note.id}>
            <div className="te-top"><span className="te-kind is-training">{t(`categories.${note.category}`)}</span><span className="tn-when">{when(note.createdAt)}</span></div>
            <p className="tn-body">{note.body}</p>
            <div className="tn-meta">
              <span>{t('expires', { date: until(note.expiresAt) })}</span>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={Boolean(busy)} onClick={() => remove(note.id)}><Trash2 size={15} aria-hidden="true" />{t('delete')}</button>
            </div>
          </article>)
        : <p className="tp-empty">{t('none')}</p>}
    </div>
  )
}
