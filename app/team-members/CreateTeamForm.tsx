'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Plus } from 'lucide-react'
import { cleanTeamName } from '@/lib/own-team'
import { useApiErrorText } from '@/lib/use-api-error-text'

// A coach's own team (sql/78): a name, then straight to the team page. The id is chosen
// here once, so pressing again after a dropped connection gives the same team.
export default function CreateTeamForm() {
  const t = useTranslations('ownTeam')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [id] = useState(() => crypto.randomUUID())
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const clean = cleanTeamName(name)

  const create = async () => {
    if (busy || !clean) return
    setBusy(true); setError('')
    const response = await fetch('/api/my-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create', data: { id, name: clean } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    if (!response?.ok) { setBusy(false); setError(errorText(body, t('createFailed'))); return }
    router.push(`/team-members/${id}`)
  }

  return <div id="create" className="ui-card tm-create">
    <b className="tm-create-title">{t('createTitle')}</b>
    <p className="tp-note">{t('createHint')}</p>
    <label className="ui-field"><span>{t('nameLabel')}</span>
      <input value={name} maxLength={80} placeholder={t('namePlaceholder')} onChange={event => { setName(event.target.value); setError('') }} />
    </label>
    <button type="button" className="ui-btn ui-btn-primary" disabled={!clean || busy} onClick={create}><Plus size={18} aria-hidden="true" />{busy ? t('creating') : t('create')}</button>
    {error && <p className="tp-alert" role="alert">{error}</p>}
  </div>
}
