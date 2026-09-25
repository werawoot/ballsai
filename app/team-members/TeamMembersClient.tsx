'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, MailPlus, Users, X } from 'lucide-react'
import Link from 'next/link'

type TournamentRelation = { name: string | null } | { name: string | null }[] | null
type Team = { id: string; name: string; tournament_id: string; status: string; tournaments?: TournamentRelation }
type Member = { id: string; team_id: string; athlete_id: string; status: string; invited_at: string; teams?: { name: string | null } | null }

export default function TeamMembersClient({ teams, invites }: { teams: Team[]; invites: Member[] }) {
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.id ?? '')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [inviteState, setInviteState] = useState(invites)
  const router = useRouter()

  const invite = async () => {
    setBusy(true); setMessage('')
    const response = await fetch(`/api/teams/${selectedTeam}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    const result = await response.json().catch(() => null) as { error?: string } | null
    setMessage(response.ok ? 'ส่งคำเชิญแล้ว' : (result?.error ?? 'ส่งคำเชิญไม่สำเร็จ'))
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
      setMessage(result?.error ?? 'ส่งสมัครทีมไม่สำเร็จ')
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
    {teams.length > 0 && <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><MailPlus size={18} color="#CC0001" /> เชิญนักกีฬาเข้าทีม</div>
      <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #ddd', marginBottom: 10 }}>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="อีเมลบัญชีนักกีฬา" type="email" style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #ddd' }} />
        <button onClick={invite} disabled={busy || !email || !selectedTeam} style={{ background: '#CC0001', color: 'white', border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800 }}>{busy ? 'กำลังส่ง' : 'เชิญ'}</button>
      </div>
      {message && <p style={{ margin: '10px 0 0', color: message === 'ส่งคำเชิญแล้ว' ? '#15803d' : '#b91c1c', fontSize: 13 }}>{message}</p>}
      {selected?.status === 'draft' && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eee' }}><p style={{ color: '#666', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>เมื่อนักกีฬาอย่างน้อยหนึ่งคนตอบรับแล้ว ส่งสมัครรายการเพื่อไปขั้นชำระเงิน</p><button onClick={submitTeam} disabled={busy} style={{ background: '#172033', color: 'white', border: 0, borderRadius: 10, padding: '10px 14px', fontWeight: 800 }}>{busy ? 'กำลังส่ง...' : 'ส่งสมัครรายการ'}</button></div>}
      {selected && <p style={{ color: '#888', fontSize: 12, marginTop: 10 }}>รายการ: {selectedTournamentName ?? '—'} · สถานะ: {selected.status === 'draft' ? 'กำลังจัด roster' : selected.status === 'pending' ? 'รอตรวจสอบ' : selected.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ไม่ผ่าน'}</p>}
    </section>}

    <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><Users size={18} color="#CC0001" /> คำเชิญของฉัน</div>
      {inviteState.length === 0 ? <div><p style={{ color: '#888', fontSize: 14, lineHeight: 1.55 }}>ยังไม่มีคำเชิญเข้าทีม ดูรายการที่สนใจ แล้วให้โค้ชหรือผู้จัดสร้างทีมและเชิญด้วยอีเมลบัญชีนี้</p><Link href="/tournaments" style={{ display: 'inline-block', marginTop: 4, color: '#CC0001', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>ค้นหารายการแข่ง →</Link></div> : <div style={{ display: 'grid', gap: 10 }}>
        {inviteState.map(invite => <div key={invite.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
          <div><strong>{invite.teams?.name ?? 'ทีมของคุณ'}</strong><div style={{ color: '#888', fontSize: 12 }}>{invite.status === 'pending' ? 'รอการตอบรับ' : invite.status === 'accepted' ? 'เข้าร่วมแล้ว' : 'ปฏิเสธแล้ว'}</div></div>
          {invite.status === 'pending' && <div style={{ display: 'flex', gap: 6 }}><button onClick={() => respond(invite.id, 'accepted')} aria-label="ยอมรับคำเชิญ" style={{ border: 0, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: 8 }}><Check size={16} /></button><button onClick={() => respond(invite.id, 'declined')} aria-label="ปฏิเสธคำเชิญ" style={{ border: 0, background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 8 }}><X size={16} /></button></div>}
        </div>)}
      </div>}
      {inviteMessage && <div style={{ marginTop: 12, background: inviteMessage.includes('ไม่สำเร็จ') ? '#fef2f2' : '#f0fdf4', color: inviteMessage.includes('ไม่สำเร็จ') ? '#b91c1c' : '#166534', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>{inviteMessage}{inviteMessage.startsWith('รับคำเชิญแล้ว') && <Link href="/career" style={{ display: 'block', marginTop: 5, color: 'inherit', fontWeight: 800 }}>ดู Athlete Passport →</Link>}</div>}
    </section>
  </div>
}
