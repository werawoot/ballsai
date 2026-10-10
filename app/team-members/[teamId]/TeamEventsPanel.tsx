'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CalendarPlus, Check, MapPin, X } from 'lucide-react'
import { bangkokIso, eventCounts, eventTimeParts, type EventKind } from '@/lib/team-events'
import { useApiErrorText } from '@/lib/use-api-error-text'

type Member = { athleteId: string; name: string }
export type PanelEvent = {
  id: string; kind: EventKind; title: string; startsAt: string; location: string | null
  answers: Record<string, 'yes' | 'no'>; present: string[] | null; attendanceOpen: boolean
}
type Message = { tone: 'ok' | 'error'; text: string } | null

const post = async (action: string, data: Record<string, unknown>) => {
  const response = await fetch('/api/team-events', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }),
  }).catch(() => null)
  return { ok: Boolean(response?.ok), body: response ? await response.json().catch(() => null) : null }
}
const bangkokToday = () => new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)

// The coach's side of team events (sql/70): make a session or a match, see who answered
// "coming" before it, tick who came after it. The event id is made once per form, so a
// retried save after a dropped connection updates the same event instead of adding one.
export default function TeamEventsPanel({ teamId, members, upcoming, past, ready }: { teamId: string; members: Member[]; upcoming: PanelEvent[]; past: PanelEvent[]; ready: boolean }) {
  const t = useTranslations('teamEvents')
  const errorText = useApiErrorText()
  const when = (iso: string) => { const at = eventTimeParts(iso); return t('when', { ...at, weekday: t(`weekdays.${at.weekday}`) }) }
  const router = useRouter()
  const [form, setForm] = useState<{ id: string; kind: EventKind; title: string; date: string; time: string; location: string } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<Message>(null)
  const [checking, setChecking] = useState<{ id: string; present: string[] } | null>(null)

  if (!ready) return <p className="tp-empty">{t('notReady')}</p>

  const open = () => {
    setForm({ id: crypto.randomUUID(), kind: 'training', title: t('titleTraining'), date: bangkokToday(), time: '17:00', location: '' })
    setMessage(null)
  }
  const pickKind = (kind: EventKind) => setForm(current => current && {
    ...current, kind,
    // Swap the suggested title along with the kind, but never a title the coach typed.
    title: [t('titleTraining'), t('titleMatch'), ''].includes(current.title.trim()) ? (kind === 'match' ? t('titleMatch') : t('titleTraining')) : current.title,
  })
  const save = async () => {
    if (!form || busy) return
    const startsAt = bangkokIso(form.date, form.time)
    if (!startsAt || !form.title.trim()) { setMessage({ tone: 'error', text: t('saveFailed') }); return }
    setBusy('save'); setMessage(null)
    const result = await post('save', { id: form.id, teamId, kind: form.kind, title: form.title, startsAt, location: form.location })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('saveFailed')) }); return }
    setForm(null)
    setMessage({ tone: 'ok', text: t('saved') })
    router.refresh()
  }
  const cancel = async (id: string) => {
    if (busy || !window.confirm(t('cancelConfirm'))) return
    setBusy(`cancel:${id}`); setMessage(null)
    const result = await post('cancel', { id })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('cancelFailed')) }); return }
    setMessage({ tone: 'ok', text: t('cancelled') })
    router.refresh()
  }
  const saveAttendance = async () => {
    if (!checking || busy) return
    setBusy(`attendance:${checking.id}`); setMessage(null)
    const result = await post('attendance', { id: checking.id, present: checking.present })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('attendanceFailed')) }); return }
    setChecking(null)
    setMessage({ tone: 'ok', text: t('attendanceSaved') })
    router.refresh()
  }
  const toggle = (athleteId: string) => setChecking(current => current && {
    ...current, present: current.present.includes(athleteId) ? current.present.filter(id => id !== athleteId) : [...current.present, athleteId],
  })

  const memberIds = members.map(member => member.athleteId)
  const checklist = (event: PanelEvent) => checking?.id === event.id
    ? <div className="te-check">
        <p className="tp-note">{t('attendanceTitle')}</p>
        <div className="tp-chips is-wrap">
          {members.map(member => {
            const on = checking.present.includes(member.athleteId)
            return <button type="button" key={member.athleteId} className={on ? 'is-on' : undefined} aria-pressed={on} onClick={() => toggle(member.athleteId)}>{on && <Check size={15} aria-hidden="true" />}{member.name}</button>
          })}
        </div>
        <button type="button" className="ui-btn ui-btn-primary" disabled={Boolean(busy)} onClick={saveAttendance}>{busy === `attendance:${event.id}` ? t('saving') : t('attendanceSave', { count: checking.present.length })}</button>
      </div>
    : <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" onClick={() => { setChecking({ id: event.id, present: event.present ?? memberIds.filter(id => event.answers[id] === 'yes') }); setMessage(null) }}>{t('attendanceOpen')}</button>

  const card = (event: PanelEvent, isPast: boolean) => {
    const counts = eventCounts(Object.entries(event.answers).map(([athlete_id, answer]) => ({ athlete_id, answer })), memberIds)
    return <article className="ui-card te-card" key={event.id}>
      <div className="te-top">
        <span className={`te-kind is-${event.kind}`}>{t(`kinds.${event.kind}`)}</span>
        <time dateTime={event.startsAt}>{when(event.startsAt)}</time>
      </div>
      <b className="te-title">{event.title}</b>
      {event.location && <span className="te-place"><MapPin size={14} aria-hidden="true" />{event.location}</span>}
      {!isPast && <p className="te-counts">{t('counts', counts)}</p>}
      {!isPast && members.length > 0 && <details className="te-who">
        <summary>{t('whoAnswered')}</summary>
        <ul>{members.map(member => {
          const answer = event.answers[member.athleteId] ?? 'waiting'
          return <li key={member.athleteId}><span>{member.name}</span><em className={`is-${answer}`}>{t(`answer.${answer}`)}</em></li>
        })}</ul>
      </details>}
      {event.present && checking?.id !== event.id && <p className="te-counts">{t('attendanceDone', { count: event.present.length })}</p>}
      {isPast && !event.present && checking?.id !== event.id && <p className="te-counts">{t('attendanceNone')}</p>}
      <div className="te-actions">
        {event.attendanceOpen && members.length > 0 && checklist(event)}
        {!isPast && <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm te-cancel" disabled={Boolean(busy)} onClick={() => cancel(event.id)}><X size={15} aria-hidden="true" />{t('cancelEvent')}</button>}
      </div>
    </article>
  }

  return (
    <div className="te">
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      {form
        ? <div className="ui-card te-form">
            <div className="tp-chips" role="group" aria-label={t('kindLabel')}>
              {(['training', 'match'] as const).map(kind => <button type="button" key={kind} className={form.kind === kind ? 'is-on' : undefined} aria-pressed={form.kind === kind} onClick={() => pickKind(kind)}>{t(`kinds.${kind}`)}</button>)}
            </div>
            <label>{t('titleLabel')}<input value={form.title} maxLength={80} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
            <div className="te-row">
              <label>{t('dateLabel')}<input type="date" value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
              <label>{t('timeLabel')}<input type="time" value={form.time} onChange={event => setForm({ ...form, time: event.target.value })} /></label>
            </div>
            <label>{t('locationLabel')}<input value={form.location} maxLength={120} onChange={event => setForm({ ...form, location: event.target.value })} /></label>
            <div className="tp-actions">
              <button type="button" className="ui-btn ui-btn-primary" disabled={Boolean(busy)} onClick={save}>{busy === 'save' ? t('saving') : t('save')}</button>
              <button type="button" className="ui-btn ui-btn-ghost" disabled={Boolean(busy)} onClick={() => setForm(null)}>{t('cancelForm')}</button>
            </div>
          </div>
        : <button type="button" className="ui-btn ui-btn-primary te-new" onClick={open}><CalendarPlus size={17} aria-hidden="true" />{t('create')}</button>}

      <h3 className="te-sub">{t('upcoming')}</h3>
      {upcoming.length ? upcoming.map(event => card(event, false)) : <p className="tp-empty">{t('none')}</p>}
      <h3 className="te-sub">{t('past')}</h3>
      {past.length ? past.map(event => card(event, true)) : <p className="tp-empty">{t('noPast')}</p>}
    </div>
  )
}
