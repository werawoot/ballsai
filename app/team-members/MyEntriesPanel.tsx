'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Trophy } from 'lucide-react'
import ConfirmButton from '@/components/ConfirmButton'
import type { EntryRosterRow } from '@/lib/own-team'
import { useApiErrorText } from '@/lib/use-api-error-text'

// Tournaments a coach entered the athlete (or the guardian's child) in (sql/78, D1). Each
// can be withdrawn until the coach submits the entry; after that the coach or organizer is.
export default function MyEntriesPanel({ rows, viewerId }: { rows: EntryRosterRow[]; viewerId: string }) {
  const t = useTranslations('ownTeam')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!rows.length) return null

  const withdraw = async (row: EntryRosterRow) => {
    if (busy) return
    setBusy(row.member_id); setMessage(null)
    const response = await fetch('/api/my-team', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'withdraw', data: { memberId: row.member_id } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(null)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('withdrawFailed')) }); return }
    setMessage({ tone: 'ok', text: t('withdrawn') })
    router.refresh()
  }

  return <section className="ui-card me-card" aria-labelledby="me-entries">
    <h2 id="me-entries"><Trophy size={17} aria-hidden="true" /> {t('entriesTitle')}</h2>
    {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
    {rows.map(row => <article className="me-item" key={row.member_id}>
      <b className="te-title">{row.tournament_name}</b>
      <span className="me-for">{t('entryFor', { team: row.team_name })}{row.athlete_id !== viewerId && row.athlete_name ? ` · ${row.athlete_name}` : ''}</span>
      {row.status === 'declined'
        ? <span className="me-for">{t('entryWithdrawn')}</span>
        : row.can_withdraw
          ? <><span className="me-for">{t('withdrawHint')}</span><ConfirmButton label={t('withdraw')} question={t('withdrawConfirm')} disabled={Boolean(busy)} onConfirm={() => withdraw(row)} /></>
          : <span className="me-for">{t('entryLocked')}</span>}
    </article>)}
  </section>
}
