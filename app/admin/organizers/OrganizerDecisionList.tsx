'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

export type RequestItem = { id: string; name: string; email: string; orgName: string; orgType: string; province: string; phone: string; note: string; createdAt: string }
export type OrganizerItem = { userId: string; name: string; email: string; orgName: string | null; province: string | null }

// Approve, decline (with a reason) or revoke (with a reason). The database decides who may
// and refuses a second decision; this only sends the choice and shows the answer.
export default function OrganizerDecisionList({ requests = [], organizers = [] }: { requests?: RequestItem[]; organizers?: OrganizerItem[] }) {
  const t = useTranslations('adminOrganizers')
  const apiErrors = useTranslations('apiErrors')
  const router = useRouter()
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [messages, setMessages] = useState<Record<string, string>>({})

  const send = async (key: string, body: Record<string, unknown>) => {
    setBusy(key)
    setMessages(current => ({ ...current, [key]: '' }))
    let response: Response
    try {
      response = await fetch('/api/admin/organizers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    } catch {
      setBusy(null)
      setMessages(current => ({ ...current, [key]: apiErrors('requestInvalid') }))
      return
    }
    const data = await response.json().catch(() => null) as { code?: string; error?: string } | null
    setBusy(null)
    if (!response.ok) {
      setMessages(current => ({ ...current, [key]: data?.code && apiErrors.has(data.code as never) ? apiErrors(data.code as never) : (data?.error ?? apiErrors('requestInvalid')) }))
      return
    }
    router.refresh()
  }
  const reasonOk = (key: string) => (reasons[key] ?? '').trim().length >= 3
  const reasonField = (key: string, label: string) => <>
    <label htmlFor={`ao-reason-${key}`}>{label}</label>
    <input id={`ao-reason-${key}`} value={reasons[key] ?? ''} maxLength={500} onChange={event => setReasons(current => ({ ...current, [key]: event.target.value }))} />
  </>

  if (!requests.length && !organizers.length) return <p className="ao-muted">{t('empty')}</p>

  return (
    <ul className="ao-list">
      {requests.map(item => <li key={item.id} className="ao-item">
        <p className="ao-org"><b>{item.orgName}</b> · {t.has(`types.${item.orgType}` as never) ? t(`types.${item.orgType}` as never) : item.orgType} · {item.province}</p>
        <p>{item.name}{item.email && item.email !== item.name ? ` · ${item.email}` : ''}</p>
        <p>{t('phone')}: <a href={`tel:${item.phone}`}>{item.phone}</a> · {t('sent')} {item.createdAt}</p>
        {item.note && <p className="ao-note">{item.note}</p>}
        {reasonField(item.id, t('declineReason'))}
        <div className="ao-actions">
          <button type="button" className="ao-approve" disabled={busy !== null} onClick={() => send(item.id, { action: 'decide', requestId: item.id, approve: true })}>{t('approve')}</button>
          <button type="button" className="ao-decline" disabled={busy !== null || !reasonOk(item.id)} onClick={() => send(item.id, { action: 'decide', requestId: item.id, approve: false, reason: reasons[item.id] })}>{t('decline')}</button>
        </div>
        {messages[item.id] && <p className="ao-error" role="alert">{messages[item.id]}</p>}
      </li>)}
      {organizers.map(item => <li key={item.userId} className="ao-item">
        <p className="ao-org"><b>{item.orgName ?? t('noOrg')}</b>{item.province ? ` · ${item.province}` : ''}</p>
        <p>{item.name}{item.email && item.email !== item.name ? ` · ${item.email}` : ''}</p>
        <details>
          <summary>{t('revoke')}</summary>
          <p className="ao-muted">{t('revokeEffect')}</p>
          {reasonField(item.userId, t('revokeReason'))}
          <div className="ao-actions">
            <button type="button" className="ao-decline" disabled={busy !== null || !reasonOk(item.userId)} onClick={() => send(item.userId, { action: 'revoke', userId: item.userId, reason: reasons[item.userId] })}>{t('revokeConfirm')}</button>
          </div>
        </details>
        {messages[item.userId] && <p className="ao-error" role="alert">{messages[item.userId]}</p>}
      </li>)}
    </ul>
  )
}
