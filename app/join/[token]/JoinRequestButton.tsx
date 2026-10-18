'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useApiErrorText } from '@/lib/use-api-error-text'
import { postTeamJoin } from '@/lib/team-join'

type Outcome = 'requested' | 'already_requested' | 'joined' | 'already_member'

// Ask to join (ADR-011). `auto` sends the request once on arrival, for someone who came back
// from signing in or making their athlete profile; a repeat is the same request.
export default function JoinRequestButton({ token, auto, welcomePath }: { token: string; auto: boolean; welcomePath: string }) {
  const t = useTranslations('joinPage')
  const errorText = useApiErrorText()
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [error, setError] = useState<{ text: string; needsProfile: boolean } | null>(null)
  const sent = useRef(false)

  const ask = async () => {
    if (busy) return
    setBusy(true); setError(null)
    const result = await postTeamJoin('request', { token })
    setBusy(false)
    if (!result.ok) { setError({ text: errorText(result.body, t('failed')), needsProfile: result.body?.code === 'joinProfileRequired' }); return }
    setOutcome(result.body?.data as Outcome)
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
  </>
}
