'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MailPlus, Users } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { RegisterSteps } from '@/app/tournaments/[id]/RegisterSteps'
import '@/app/tournaments/tournaments.css'

type TournamentRelation = { name: string | null } | { name: string | null }[] | null
type Team = { id: string; name: string; tournament_id: string; status: string; tournaments?: TournamentRelation }
type Member = { id: string; team_id: string; athlete_id: string; status: string; invited_at: string; teams?: { name: string | null } | null }

export default function TeamMembersClient({ teams, invites, counts }: { teams: Team[]; invites: Member[]; counts: Record<string, { accepted: number; pending: number }> | null }) {
  const tl = useTranslations('labels')
  const tInvite = useTranslations('teamInvite')
  const t = useTranslations('teamRoster')
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.id ?? '')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [inviteOk, setInviteOk] = useState(false)
  const [inviteState, setInviteState] = useState(invites)
  const router = useRouter()

  const invite = async () => {
    setBusy(true); setMessage('')
    const response = await fetch(`/api/teams/${selectedTeam}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const result = await response.json().catch(() => null) as { error?: string } | null
    // The server's own wording for a refusal is shown as it is sent.
    setInviteOk(response.ok)
    setMessage(response.ok ? t('sent') : (result?.error ?? t('sendFailed')))
    if (response.ok) setEmail('')
    setBusy(false)
  }

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    setInviteMessage('')
    const response = await fetch(`/api/team-members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
    if (response.ok) {
      setInviteState(items => items.map(item => item.id === id ? { ...item, status } : item))
      setInviteMessage(status === 'accepted' ? 'รับคำเชิญแล้ว คุณจะถูกเลือกลงผลแข่งให้ทีมนี้ได้เมื่อทีมได้รับการยืนยัน' : 'ปฏิเสธคำเชิญแล้ว')
      return
    }
    const result = await response.json().catch(() => null) as { error?: string } | null
    setInviteMessage(result?.error ?? 'อัปเดตคำเชิญไม่สำเร็จ')
  }

  const submitTeam = async () => {
    const team = teams.find(item => item.id === selectedTeam)
    if (!team) return
    setBusy(true); setMessage('')
    const response = await fetch(`/api/teams/${team.id}/submit`, { method: 'POST' })
    const result = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok) {
      setInviteOk(false)
      setMessage(result?.error ?? t('submitFailed'))
      setBusy(false)
      return
    }
    router.push(`/tournaments/${team.tournament_id}?teamId=${encodeURIComponent(team.id)}`)
  }

  const selected = teams.find(team => team.id === selectedTeam)
  const selectedTournament = selected?.tournaments
  const selectedTournamentName = Array.isArray(selectedTournament)
    ? selectedTournament[0]?.name
    : selectedTournament?.name

  return <div style={{ display: 'grid', gap: 16 }}>
    {teams.length > 0 && <section aria-label={t('invite')} style={{ display: 'grid', gap: 12 }}>
      {selected?.status === 'draft' && <RegisterSteps current={2} />}
      <p className="ui-eyebrow" style={{ letterSpacing: 0, textTransform: 'none', fontSize: 13, margin: 0 }}>{selected?.name}{selectedTournamentName ? ` · ${selectedTournamentName}` : ''}</p>
      <h2 className="ui-h1" style={{ margin: 0 }}>{(counts?.[selectedTeam]?.accepted ?? 0) + (counts?.[selectedTeam]?.pending ?? 0) === 0 ? t('inviteFirst') : t('invite')}</h2>
      {teams.length > 1 && <select aria-label={t('team')} value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #ddd' }}>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>}
      <label className="ui-field">
        <span>{t('emailLabel')}</span>
        <input autoComplete="off" inputMode="email" onChange={e => setEmail(e.target.value)} placeholder="name@example.com" type="email" value={email} />
      </label>
      <button className="ui-btn ui-btn-ghost" disabled={busy || !email || !selectedTeam} onClick={invite} type="button"><MailPlus size={18} aria-hidden="true" />{busy ? t('sending') : t('send')}</button>
      {message && <p role={inviteOk ? 'status' : 'alert'} style={{ margin: 0, color: inviteOk ? '#15803d' : '#b91c1c', fontSize: 14 }}>{message}</p>}
      <p style={{ margin: 0, color: 'var(--ui-mute)', fontSize: 13, lineHeight: 1.55 }}>{t('hint')}</p>
      {counts && selected && <p style={{ margin: 0, color: 'var(--ui-mute)', fontSize: 13, fontWeight: 700 }}>{t('counts', { accepted: counts[selected.id]?.accepted ?? 0, pending: counts[selected.id]?.pending ?? 0 })}</p>}
      {selected?.status === 'draft' && <div className="tn-dock"><div className="tn-dock-inner">
        {counts && (counts[selected.id]?.accepted ?? 0) < 1 && <p style={{ margin: '0 0 8px', textAlign: 'center', color: 'var(--ui-mute)', fontSize: 13 }}>{t('needAccepted', { count: counts[selected.id]?.accepted ?? 0 })}</p>}
        <button className="ui-btn ui-btn-primary" disabled={busy || Boolean(counts && (counts[selected.id]?.accepted ?? 0) < 1)} onClick={submitTeam} type="button">{busy ? t('submitting') : t('submit')}</button>
      </div></div>}
    </section>}

    {inviteState.length > 0 && <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><Users size={18} color="#CC0001" /> คำเชิญของฉัน</div>
      <div style={{ display: 'grid', gap: 10 }}>
        {inviteState.map(invite => <div key={invite.id} style={{ display: 'grid', gap: 10, border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
          <div><strong>{invite.teams?.name ?? 'ทีมของคุณ'}</strong><div style={{ color: '#888', fontSize: 12 }}>{invite.status === 'pending' ? 'รอการตอบรับ' : invite.status === 'accepted' ? 'เข้าร่วมแล้ว' : 'ปฏิเสธแล้ว'}</div></div>
          {invite.status === 'pending' && <div style={{ display: 'grid', gap: 8, width: '100%' }}>
            <p style={{ margin: 0, color: '#555', fontSize: 13, lineHeight: 1.6 }}>{tInvite('ifJoin')}<br />{tInvite('ifDecline')}</p>
            <button type="button" className="ui-btn ui-btn-primary" onClick={() => respond(invite.id, 'accepted')}>{tInvite('join')}</button>
            <button type="button" className="ui-btn ui-btn-ghost" onClick={() => respond(invite.id, 'declined')}>{tInvite('decline')}</button>
          </div>}
        </div>)}
      </div>
      {inviteMessage && <div style={{ marginTop: 12, background: inviteMessage.includes('ไม่สำเร็จ') ? '#fef2f2' : '#f0fdf4', color: inviteMessage.includes('ไม่สำเร็จ') ? '#b91c1c' : '#166534', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>{inviteMessage}{inviteMessage.startsWith('รับคำเชิญแล้ว') && <Link href="/career" style={{ display: 'block', marginTop: 5, color: 'inherit', fontWeight: 800 }}>{tl('teamMembersLabels.passport')}</Link>}</div>}
    </section>}
  </div>
}
