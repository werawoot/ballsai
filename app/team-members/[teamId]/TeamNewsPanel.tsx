'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Send, Trash2 } from 'lucide-react'
import { eventTimeParts } from '@/lib/team-events'
import { useApiErrorText } from '@/lib/use-api-error-text'

export type SentAnnouncement = { id: string; body: string; createdAt: string; toAthletes: boolean; toGuardians: boolean; read: number; total: number }

const post = async (action: string, data: Record<string, unknown>) => {
  const response = await fetch('/api/team-announcements', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }),
  }).catch(() => null)
  return { ok: Boolean(response?.ok), body: response ? await response.json().catch(() => null) : null }
}

// The coach's side of team announcements (sql/71): one message to the athletes, their
// guardians or both, and how many have read each one. The id is made once per draft, so a
// retried send after a dropped connection is the same message, never a second one.
export default function TeamNewsPanel({ teamId, sent, ready }: { teamId: string; sent: SentAnnouncement[]; ready: boolean }) {
  const t = useTranslations('teamNews')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [draft, setDraft] = useState({ id: '', body: '', toAthletes: true, toGuardians: true })
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!ready) return <p className="tp-empty">{t('notReady')}</p>

  const when = (iso: string) => { const at = eventTimeParts(iso); return t('when', { day: at.day, month: at.month, time: at.time }) }
  const audience = (item: SentAnnouncement) => item.toAthletes && item.toGuardians ? t('audienceBoth') : item.toAthletes ? t('audienceAthletes') : t('audienceGuardians')
  const text = draft.body.trim()
  const canSend = text.length > 0 && text.length <= 500 && (draft.toAthletes || draft.toGuardians) && !busy

  const send = async () => {
    if (!canSend) return
    const id = draft.id || crypto.randomUUID()
    setDraft(current => ({ ...current, id }))
    setBusy('send'); setMessage(null)
    const result = await post('post', { id, teamId, body: text, toAthletes: draft.toAthletes, toGuardians: draft.toGuardians })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('sendFailed')) }); return }
    setDraft({ id: '', body: '', toAthletes: draft.toAthletes, toGuardians: draft.toGuardians })
    setMessage({ tone: 'ok', text: t('sent', { count: Number(result.body?.data ?? 0) }) })
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
  // Editing the text after a failed send makes it a new message with a new id.
  const edit = (body: string) => setDraft(current => ({ ...current, body, id: '' }))

  return (
    <div className="te">
      <div className="ui-card te-form">
        <label>{t('label')}<textarea value={draft.body} maxLength={500} rows={3} placeholder={t('placeholder')} onChange={event => edit(event.target.value)} /></label>
        <div className="tn-row">
          <div className="tp-chips is-wrap" role="group" aria-label={t('audience')}>
            {(['toAthletes', 'toGuardians'] as const).map(key => <button type="button" key={key} className={draft[key] ? 'is-on' : undefined} aria-pressed={draft[key]}
              onClick={() => setDraft(current => ({ ...current, [key]: !current[key], id: '' }))}>{t(key)}</button>)}
          </div>
          <small className="tn-length">{t('length', { count: draft.body.length })}</small>
        </div>
        <p className="tp-note">{t('rule')}</p>
        {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        <button type="button" className="ui-btn ui-btn-primary" disabled={!canSend} onClick={send}><Send size={16} aria-hidden="true" />{busy === 'send' ? t('sending') : t('send')}</button>
      </div>

      <h3 className="te-sub">{t('history')}</h3>
      {sent.length
        ? sent.map(item => <article className="ui-card te-card" key={item.id}>
            <p className="tn-body">{item.body}</p>
            <div className="tn-meta">
              <span>{audience(item)} · {t('readCount', { read: item.read, total: item.total })} · {when(item.createdAt)}</span>
              <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" aria-label={`${t('delete')}: ${item.body.slice(0, 40)}`} disabled={Boolean(busy)} onClick={() => remove(item.id)}><Trash2 size={15} aria-hidden="true" />{t('delete')}</button>
            </div>
          </article>)
        : <p className="tp-empty">{t('none')}</p>}
    </div>
  )
}
