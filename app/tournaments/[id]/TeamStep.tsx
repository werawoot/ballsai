'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { RegisterSteps, TournamentSummary, type TournamentSummaryProps } from './RegisterSteps'

// Step 1: name the team. The server decides who may (coach or organizer), whether the
// tournament is still open and not full, and that one account has one team per
// tournament (sql/production-hardening.sql); this screen shows its answer.
export default function TeamStep({ tournamentId, summary, free = false }: { tournamentId: string; summary: TournamentSummaryProps; free?: boolean }) {
  const t = useTranslations('tournament')
  const router = useRouter()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!name.trim() || saving) return
    setSaving(true)
    setError('')
    const response = await fetch(`/api/tournaments/${tournamentId}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    }).catch(() => null)
    if (response?.status === 401) {
      router.push(`/login?next=${encodeURIComponent(`/tournaments/${tournamentId}?step=team`)}`)
      return
    }
    const result = (await response?.json().catch(() => null)) as { error?: string; teamId?: string } | null
    if (!response?.ok || !result?.teamId) {
      setError(result?.error ?? t('teamFailed'))
      setSaving(false)
      return
    }
    router.push(`/team-members?team=${encodeURIComponent(result.teamId)}`)
  }

  return <form className="tn-detail-body" onSubmit={submit}>
    <RegisterSteps current={1} free={free} />
    <TournamentSummary {...summary} />
    <h1 className="ui-h1 tn-form-title">{t('teamTitle')}</h1>
    <p className="tn-form-intro">{t('teamIntro')}</p>
    <label className="ui-field">
      <span>{t('teamName')}</span>
      <input autoComplete="off" maxLength={80} onChange={event => setName(event.target.value)} placeholder={t('teamPlaceholder')} required value={name} />
    </label>
    <p className="tn-info">{t(free ? 'teamNextFree' : 'teamNext')}</p>
    {error && <p className="tn-error" role="alert">{error}</p>}
    <div className="tn-dock"><div className="tn-dock-inner">
      <button className="ui-btn ui-btn-primary" disabled={!name.trim() || saving} type="submit">{saving ? t('teamSaving') : t('teamSubmit')} <ArrowRight size={18} aria-hidden="true" /></button>
    </div></div>
  </form>
}
