'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useApiErrorText } from '@/lib/use-api-error-text'
import { postTeamJoin } from '@/lib/team-join'
import { createClient } from '@/lib/supabase'

type Outcome = 'requested' | 'already_requested' | 'joined' | 'already_member'

// Ask to join (ADR-011). `auto` sends the request once on arrival, for someone who came back
// from signing in or making their athlete profile; a repeat is the same request.
// A profile with no name is asked for one here: the coach decides by name (ADR-011).
export default function JoinRequestButton({ token, auto, welcomePath, userId }: { token: string; auto: boolean; welcomePath: string; userId: string }) {
  const t = useTranslations('joinPage')
  const errorText = useApiErrorText()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<{ text: string; needsProfile: boolean; needsName: boolean } | null>(null)
  const [name, setName] = useState('')
  const sent = useRef(false)

  const ask = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const result = await postTeamJoin('request', { token })
    setBusy(false)
    if (!result.ok) { setError({ text: errorText(result.body, t('failed')), needsProfile: result.body?.code === 'joinProfileRequired', needsName: result.body?.code === 'joinNameRequired' }); return }
    setOutcome(result.body?.data as Outcome)
  }
  const saveName = async () => {
    const clean = name.trim().replace(/\s+/g, ' ')
    if (busy || clean.length < 2) return
    setBusy(true)
    const { error: saveError } = await createClient().from('athlete_profiles').update({ display_name: clean }).eq('user_id', userId)
    setBusy(false)
    if (saveError) { setError({ text: t('nameFailed'), needsProfile: false, needsName: true }); return }
    await ask()
  }
  useEffect(() => {
    // Sent after this render, not inside it, so the request starts from a settled page.
    if (auto && !sent.current) { sent.current = true; void Promise.resolve().then(ask) }
  })

  if (outcome) return <div className="ui-card tj-card" role="status">
    <p className="tp-ok">{t(`outcome.${outcome}`)}</p>
    <Link className="ui-btn ui-btn-ghost ui-btn-sm" href="/team-members">{t('myTeams')}</Link>
  </div>
  return <>
    <button type="button" className="ui-btn ui-btn-primary" disabled={busy} onClick={ask}>{busy ? t('sending') : t('ask')}</button>
    <p className="tp-note">{t('askHint')}</p>
    {error && <p className="tp-alert" role="alert">{error.text}</p>}
    {error?.needsProfile && <Link className="ui-btn ui-btn-ghost ui-btn-sm" href={welcomePath}>{t('makeProfile')}</Link>}
    {error?.needsName && <form className="ui-card tj-card" onSubmit={event => { event.preventDefault(); void saveName() }}>
      <label className="ui-field"><span>{t('nameLabel')}</span>
        <input autoComplete="name" minLength={2} maxLength={60} required value={name} onChange={event => setName(event.target.value)} /></label>
      <button type="submit" className="ui-btn ui-btn-primary ui-btn-sm" disabled={busy || name.trim().length < 2}>{t('nameSave')}</button>
    </form>}
  </>
}
