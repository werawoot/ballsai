'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Check, ShieldCheck, X } from 'lucide-react'
import type { MyStaffTeamRow } from '@/lib/team-staff'
import { useApiErrorText } from '@/lib/use-api-error-text'
import './team-page.css'

// The invited person's side of assistant coaches (sql/75): each pending invitation says
// which team and head coach it is from and what an assistant will see, and accepting
// needs the 18-or-over confirmation. Accepted teams link to their team page.
export default function StaffInvitesPanel({ rows }: { rows: MyStaffTeamRow[] }) {
  const t = useTranslations('teamStaff')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [adult, setAdult] = useState<Record<string, boolean>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  if (!rows.length) return null
  const pending = rows.filter(row => row.status === 'pending')
  const accepted = rows.filter(row => row.status === 'accepted')

  const answer = async (row: MyStaffTeamRow, accept: boolean) => {
    if (busy || (accept && !adult[row.staff_id])) return
    setBusy(row.staff_id); setMessage(null)
    const response = await fetch('/api/team-staff', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond', data: { id: row.staff_id, accept, adult: accept && adult[row.staff_id] === true } }),
    }).catch(() => null)
    const body = response ? await response.json().catch(() => null) : null
    setBusy(null)
    if (!response?.ok) { setMessage({ tone: 'error', text: errorText(body, t('actionFailed')) }); return }
    setMessage({ tone: 'ok', text: accept ? t('accepted') : t('declined') })
    router.refresh()
  }

  return (
    <section className="ui-card me-card" aria-labelledby="me-staff">
      <h2 id="me-staff"><ShieldCheck size={17} aria-hidden="true" /> {pending.length ? t('invitesTitle') : t('myTeamsTitle')}</h2>
      {message && <p className={message.tone === 'ok' ? 'tp-ok' : 'tp-alert'} role={message.tone === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
      {pending.map(row => {
        const confirmed = adult[row.staff_id] === true
        return <article className="me-item" key={row.staff_id}>
          <b className="te-title">{t('inviteFrom', { team: row.team_name, head: row.head_name || t('unnamed') })}</b>
          {row.tournament_name && <span className="me-for">{row.tournament_name}</span>}
          <p className="tp-note">{t('duty')}</p>
          <label className="ts-adult"><input type="checkbox" checked={confirmed} onChange={event => setAdult(all => ({ ...all, [row.staff_id]: event.target.checked }))} />{t('adultConfirm')}</label>
          <div className="me-answers">
            <button type="button" className="ui-btn ui-btn-primary" disabled={!confirmed || Boolean(busy)} onClick={() => answer(row, true)}><Check size={16} aria-hidden="true" />{t('accept')}</button>
            <button type="button" className="ui-btn ui-btn-ghost" disabled={Boolean(busy)} onClick={() => answer(row, false)}><X size={16} aria-hidden="true" />{t('decline')}</button>
          </div>
        </article>
      })}
      {pending.length > 0 && accepted.length > 0 && <h3 className="te-sub">{t('myTeamsTitle')}</h3>}
      {accepted.map(row => <article className="me-item" key={row.staff_id}>
        <div className="te-top"><b className="te-title">{row.team_name}</b><Link className="ui-btn ui-btn-ghost ui-btn-sm" href={`/team-members/${row.team_id}`}>{t('openTeam')}</Link></div>
        <span className="me-for">{t('assistant')}{row.tournament_name ? ` · ${row.tournament_name}` : ''}</span>
      </article>)}
    </section>
  )
}
