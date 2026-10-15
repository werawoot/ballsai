'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cleanDisplayName } from '@/lib/team-staff'
import { useApiErrorText } from '@/lib/use-api-error-text'

// Before a coach invites anyone, the name families will see in the team's staff list
// (set_my_display_name, sql/76). Shown only while the account has no name (report 11).
export function NameFirst() {
  const t = useTranslations('teamInvite.nameFirst')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const clean = cleanDisplayName(name)

  const save = async () => {
    if (busy || !clean) return
    setBusy(true); setMessage(null)
    const response = await fetch('/api/team-staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'name', data: { name: clean } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(false)
    if (!response?.ok) { setMessage({ ok: false, text: errorText(body, t('failed')) }); return }
    setMessage({ ok: true, text: t('saved') })
    router.refresh()
  }

  return <div className="tm-name-first">
    <p><b>{t('title')}</b> {t('hint')}</p>
    <label className="ui-field" htmlFor="my-display-name">
      <span>{t('label')}</span>
      <input id="my-display-name" autoComplete="name" maxLength={60} value={name} onChange={event => { setName(event.target.value); setMessage(null) }} />
    </label>
    <button type="button" className="ui-btn ui-btn-primary" disabled={busy || !clean} onClick={save}>{busy ? t('saving') : t('save')}</button>
    {message && <p role={message.ok ? 'status' : 'alert'} className={message.ok ? 'tm-name-ok' : 'tm-name-error'}>{message.text}</p>}
  </div>
}
