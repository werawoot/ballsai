'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useApiErrorText } from '@/lib/use-api-error-text'

// Keep an old tournament team as my team (sql/78, D2): a new own team with the same name;
// its members are invited again, because they joined before tournaments were mentioned.
export default function KeepTeamButton({ teamId }: { teamId: string }) {
  const t = useTranslations('ownTeam')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const keep = async () => {
    if (busy) return
    setBusy(true); setError('')
    const response = await fetch('/api/my-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'keep', data: { teamId } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    if (!response?.ok) { setBusy(false); setError(errorText(body, t('keepFailed'))); return }
    router.push(`/team-members/${String(body?.data ?? '')}`)
  }
  return <>
    <button type="button" className="ui-btn ui-btn-ghost ui-btn-sm" disabled={busy} onClick={keep}>{busy ? t('keeping') : t('keep')}</button>
    <small className="tp-note">{t('keepHint')}</small>
    {error && <p className="tp-alert" role="alert">{error}</p>}
  </>
}
