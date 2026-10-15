'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trash2 } from 'lucide-react'
import { useApiErrorText } from '@/lib/use-api-error-text'

const tidy = (value: string) => value.trim().replace(/\s+/g, ' ')

// Delete my team (sql/79, docs/delete-team-v1.md). Closed until opened; says what goes and
// who is told (D1) before anything is typed; the button waits for the team's name (D3).
// Whether the team holds results, a payment or a verified position only the database
// knows, so its refusal is shown as it comes back (D2).
export default function DeleteTeamPanel({ teamId, teamName }: { teamId: string; teamName: string }) {
  const t = useTranslations('ownTeam')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const matches = tidy(typed) === tidy(teamName)

  const remove = async () => {
    if (busy || !matches) return
    setBusy(true); setError('')
    const response = await fetch('/api/my-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', data: { teamId, name: typed } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    if (!response?.ok) { setBusy(false); setError(errorText(body, t('deleteFailed'))); return }
    router.push('/team-members')
    router.refresh()
  }

  return <details className="tp-danger">
    <summary><Trash2 size={16} aria-hidden="true" />{t('deleteTitle')}</summary>
    <p className="tp-note">{t('deleteIntro')} <b>{t('deleteKept')}</b></p>
    <p className="tp-note">{t('deleteTold')}</p>
    <label className="ui-field">
      <span>{t('deleteLabel', { name: tidy(teamName) })}</span>
      <input id="tp-delete-name" autoComplete="off" value={typed} onChange={event => setTyped(event.target.value)} />
    </label>
    <button type="button" className="ui-btn tp-danger-btn" disabled={busy || !matches} onClick={remove}>{busy ? t('deleting') : t('deleteConfirm')}</button>
    {error && <p className="tp-alert" role="alert">{error}</p>}
  </details>
}
