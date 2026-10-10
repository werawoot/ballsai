'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { LogOut, UserMinus, UserPlus } from 'lucide-react'
import { STAFF_MAX, cleanStaffEmail, type StaffRow } from '@/lib/team-staff'
import { useApiErrorText } from '@/lib/use-api-error-text'

const post = async (action: string, data: Record<string, unknown>) => {
  const response = await fetch('/api/team-staff', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, data }),
  }).catch(() => null)
  return { ok: Boolean(response?.ok), body: response ? await response.json().catch(() => null) : null }
}

// The team's staff (sql/75): the head coach and up to three assistants. The head coach
// invites by email and removes; an assistant sees the list and may leave. Only the head
// coach sees emails, and the rules of what an assistant may do are stated under the list.
export default function TeamStaffPanel({ teamId, rows, isHead, ready }: { teamId: string; rows: StaffRow[]; isHead: boolean; ready: boolean }) {
  const t = useTranslations('teamStaff')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  if (!ready) return <p className="tp-empty">{t('notReady')}</p>

  const assistants = rows.filter(row => !row.is_head)
  const full = assistants.length >= STAFF_MAX
  const clean = cleanStaffEmail(email)

  const invite = async () => {
    if (busy || !clean) return
    setBusy('invite'); setMessage(null)
    const result = await post('invite', { teamId, email: clean })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('inviteFailed')) }); return }
    setEmail('')
    setMessage({ tone: 'ok', text: t('invited') })
    router.refresh()
  }
  const remove = async (row: StaffRow) => {
    const leaving = row.is_me
    if (busy || !row.id || !window.confirm(leaving ? t('leaveConfirm') : t('removeConfirm'))) return
    setBusy(`remove:${row.id}`); setMessage(null)
    const result = await post('remove', { id: row.id })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('actionFailed')) }); return }
    if (leaving) { router.push('/team-members'); return }
    setMessage({ tone: 'ok', text: t('removed') })
    router.refresh()
  }

  return (
    <div className="te">
      {!isHead && <p className="tp-note">{t('assistantNote')}</p>}
      <div className="ui-card te-form">
        <ul className="ts-list">
          {rows.map(row => {
            const pending = row.status === 'pending'
            return <li key={row.id ?? `head-${row.user_id}`}>
              <span className="ts-who">
                <b>{row.name || row.email || t('unnamed')}{row.is_me ? ` (${t('you')})` : ''}</b>
                <small>{row.is_head ? t('head') : t('assistant')}{pending ? ` · ${t('pending')}` : ''}{row.email && row.name ? ` · ${row.email}` : ''}</small>
              </span>
              {!row.is_head && (isHead || row.is_me) && <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={Boolean(busy)} onClick={() => remove(row)}>
                {row.is_me ? <LogOut size={15} aria-hidden="true" /> : <UserMinus size={15} aria-hidden="true" />}
                {row.is_me ? t('leave') : pending ? t('withdraw') : t('remove')}
              </button>}
            </li>
          })}
        </ul>
        {isHead && (full
          ? <p className="tp-note">{t('full')}</p>
          : <>
              <label>{t('inviteLabel')}<input type="email" inputMode="email" autoComplete="off" value={email} maxLength={254} placeholder="coach@example.com" onChange={event => { setEmail(event.target.value); setMessage(null) }} /></label>
              <button type="button" className="ui-btn ui-btn-primary" disabled={!clean || Boolean(busy)} onClick={invite}><UserPlus size={16} aria-hidden="true" />{busy === 'invite' ? t('inviting') : t('invite')}</button>
            </>)}
        {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        <p className="tp-note">{t('rules')}</p>
      </div>
    </div>
  )
}
