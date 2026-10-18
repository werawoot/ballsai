'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useApiErrorText } from '@/lib/use-api-error-text'
import { postTeamJoin, type JoinRequestRow } from '@/lib/team-join'

// Requests to join an own team (ADR-011). The coach sees display name, position and birth
// year only, and answers each one; accepting makes the athlete a member at once.
export default function JoinRequestsPanel({ rows }: { rows: JoinRequestRow[] }) {
  const t = useTranslations('teamJoin')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!rows.length) return <p className="tp-empty">{t('noRequests')}</p>

  const decide = async (row: JoinRequestRow, accept: boolean) => {
    if (busy) return
    setBusy(row.request_id); setMessage(null)
    const result = await postTeamJoin('decide', { requestId: row.request_id, accept })
    setBusy(null)
    if (!result.ok) { setMessage({ tone: 'error', text: errorText(result.body, t('decideFailed')) }); return }
    const name = row.display_name?.trim() || t('unnamed')
    setMessage({ tone: 'ok', text: result.body?.data === 'expired' ? t('expired') : accept ? t('accepted', { name }) : t('declined', { name }) })
    router.refresh()
  }

  return <div className="ui-card tj-card">
    {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
    <ul className="tj-requests">{rows.map(row => <li key={row.request_id}>
      <div>
        <b>{row.display_name?.trim() || t('unnamed')}</b>
        <span className="tp-note">{[row.athlete_position, row.birth_year ? t('born', { year: row.birth_year }) : null].filter(Boolean).join(' · ') || t('noDetails')}</span>
      </div>
      <div className="tj-actions">
        <button type="button" className="ui-btn ui-btn-primary ui-btn-sm" disabled={Boolean(busy)} onClick={() => decide(row, true)}>{busy === row.request_id ? t('saving') : t('accept')}</button>
        <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={Boolean(busy)} onClick={() => decide(row, false)}>{t('decline')}</button>
      </div>
    </li>)}</ul>
  </div>
}
