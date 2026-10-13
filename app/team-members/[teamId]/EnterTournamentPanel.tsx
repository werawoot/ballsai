'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trophy } from 'lucide-react'
import { ENTRY_ROSTER_MAX } from '@/lib/own-team'
import { useApiErrorText } from '@/lib/use-api-error-text'

export type OpenTournament = { id: string; name: string; start_date: string | null; location: string | null }

// Enter a tournament from my team (sql/78, D1): choose an open tournament and the accepted
// members to take. They are told at once and may withdraw until the coach submits; the
// entry then goes through the usual registration (team, slip, organizer review).
export default function EnterTournamentPanel({ teamId, members, tournaments }: { teamId: string; members: { id: string; name: string }[]; tournaments: OpenTournament[] }) {
  const t = useTranslations('ownTeam')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [tournamentId, setTournamentId] = useState(tournaments[0]?.id ?? '')
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(members.slice(0, ENTRY_ROSTER_MAX).map(member => member.id)))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (!members.length) return <p className="tp-note">{t('enterNeedsMembers')}</p>
  if (!tournaments.length) return <p className="tp-note">{t('enterNoTournaments')}</p>
  if (!open) return <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setOpen(true)}><Trophy size={17} aria-hidden="true" />{t('enter')}</button>

  const toggle = (id: string) => setChosen(previous => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next })
  const enter = async () => {
    if (busy || !tournamentId || chosen.size === 0) return
    setBusy(true); setError('')
    const response = await fetch('/api/my-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'enter', data: { teamId, tournamentId, athleteIds: [...chosen] } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    if (!response?.ok) { setBusy(false); setError(errorText(body, t('enterFailed'))); return }
    router.push(`/tournaments/${tournamentId}?teamId=${encodeURIComponent(String(body?.data ?? ''))}`)
  }

  return <div className="ui-card te-form">
    <label className="ui-field"><span>{t('tournamentLabel')}</span>
      <select value={tournamentId} onChange={event => setTournamentId(event.target.value)}>
        {tournaments.map(item => <option key={item.id} value={item.id}>{item.name}{item.start_date ? ` · ${item.start_date}` : ''}</option>)}
      </select>
    </label>
    <fieldset className="tm-pick">
      <legend>{t('pickAthletes', { count: chosen.size })}</legend>
      {members.map(member => <label key={member.id} className="tm-pick-row">
        <input type="checkbox" checked={chosen.has(member.id)} onChange={() => toggle(member.id)} />{member.name}
      </label>)}
    </fieldset>
    <p className="tp-note">{t('enterConsent')}</p>
    <button type="button" className="ui-btn ui-btn-primary" disabled={busy || chosen.size === 0 || chosen.size > ENTRY_ROSTER_MAX} onClick={enter}>{busy ? t('entering') : t('enterConfirm')}</button>
    {error && <p className="tp-alert" role="alert">{error}</p>}
  </div>
}
