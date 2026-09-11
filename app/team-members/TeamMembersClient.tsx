'use client'

import { useState } from 'react'
import { Check, LogIn, MailPlus, UserMinus, Users, X } from 'lucide-react'

type Team = { id: string; name: string }
type Member = {
  id: string
  team_id: string
  athlete_id: string
  status: string
  direction?: string | null
  invited_at: string
  teams?: { name: string | null } | null
}
type Feedback = { tone: 'success' | 'error'; text: string }

const statusCopy: Record<string, string> = {
  pending: 'รอการตอบรับ',
  accepted: 'เข้าร่วมแล้ว',
  declined: 'ปฏิเสธแล้ว',
  removed: 'ถูกนำออกแล้ว',
}

const statusColor: Record<string, string> = {
  pending: '#92400e',
  accepted: '#166534',
  declined: '#991b1b',
  removed: '#6b7280',
}

async function callApi(url: string, body: unknown): Promise<Feedback> {
  const response = await fetch(url, {
    method: url.includes('/join') ? 'POST' : 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const result = await response.json().catch(() => null) as { error?: string } | null
  return response.ok
    ? { tone: 'success', text: 'ok' }
    : { tone: 'error', text: result?.error ?? 'ดำเนินการไม่สำเร็จ' }
}

export default function TeamMembersClient({
  teams,
  invites,
  members = [],
  joinableTeams = [],
  teamLabels = {},
  nameByAthlete = {},
}: {
  teams: Team[]
  invites: Member[]
  members?: Member[]
  joinableTeams?: Team[]
  /** Team display names the athlete is entitled to see, from list_my_team_labels(). */
  teamLabels?: Record<string, string>
  nameByAthlete?: Record<string, string>
}) {
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.id ?? '')
  const [email, setEmail] = useState('')
  // Tracked as a tone, not by comparing the message text — the previous version
  // compared against one exact string, so any other success copy rendered in red.
  const [feedback, setFeedback] = useState<Feedback | null>(null)
  const [busy, setBusy] = useState(false)
  const [inviteState, setInviteState] = useState(invites)
  const [memberState, setMemberState] = useState(members)
  const [joinTeam, setJoinTeam] = useState(joinableTeams[0]?.id ?? '')
  const [joinFeedback, setJoinFeedback] = useState<Feedback | null>(null)
  // The invite card is only rendered for team managers, so a plain athlete needs its
  // own visible slot — accept/decline errors used to be written to a hidden state.
  const [inviteFeedback, setInviteFeedback] = useState<Feedback | null>(null)

  const teamMembers = memberState.filter(member => member.team_id === selectedTeam)
  const pendingRequests = teamMembers.filter(member => member.status === 'pending' && member.direction === 'request')
  const pendingInvites = teamMembers.filter(member => member.status === 'pending' && member.direction !== 'request')
  const acceptedMembers = teamMembers.filter(member => member.status === 'accepted')
  const closedMembers = teamMembers.filter(member => member.status === 'declined' || member.status === 'removed')

  const invite = async () => {
    setBusy(true); setFeedback(null)
    const result = await callApi(`/api/teams/${selectedTeam}/members`, { email })
    setFeedback(result.tone === 'success' ? { tone: 'success', text: 'ส่งคำเชิญแล้ว รอนักกีฬากดยอมรับ' } : result)
    if (result.tone === 'success') setEmail('')
    setBusy(false)
  }

  const requestJoin = async () => {
    setBusy(true); setJoinFeedback(null)
    const result = await callApi(`/api/teams/${joinTeam}/join`, {})
    setJoinFeedback(result.tone === 'success' ? { tone: 'success', text: 'ส่งคำขอแล้ว รอผู้จัดทีมอนุมัติ' } : result)
    setBusy(false)
  }

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    setBusy(true); setInviteFeedback(null)
    const result = await callApi(`/api/team-members/${id}`, { action: 'respond', status })
    if (result.tone === 'success') {
      setInviteState(items => items.map(item => item.id === id ? { ...item, status } : item))
      setInviteFeedback({ tone: 'success', text: status === 'accepted' ? 'เข้าร่วมทีมแล้ว' : 'ปฏิเสธคำเชิญแล้ว' })
    } else setInviteFeedback(result)
    setBusy(false)
  }

  const decide = async (id: string, action: 'approve' | 'decline') => {
    setBusy(true); setFeedback(null)
    const result = await callApi(`/api/team-members/${id}`, { action })
    if (result.tone === 'success') {
      setMemberState(items => items.map(item => item.id === id ? { ...item, status: action === 'approve' ? 'accepted' : 'declined' } : item))
      setFeedback({ tone: 'success', text: action === 'approve' ? 'อนุมัติเข้าทีมแล้ว' : 'ปฏิเสธคำขอแล้ว' })
    } else setFeedback(result)
    setBusy(false)
  }

  const remove = async (id: string) => {
    const reason = window.prompt('เหตุผลการนำสมาชิกออก (10–500 ตัวอักษร) จะถูกบันทึกไว้ในระบบ')
    if (reason === null) return
    setBusy(true); setFeedback(null)
    const result = await callApi(`/api/team-members/${id}`, { action: 'remove', reason })
    if (result.tone === 'success') {
      // Removed members leave the selectable match-result roster immediately.
      // Match results already confirmed keep their own membership snapshot.
      setMemberState(items => items.map(item => item.id === id ? { ...item, status: 'removed' } : item))
      setFeedback({ tone: 'success', text: 'นำสมาชิกออกแล้ว จะเลือกในหน้าบันทึกผลไม่ได้อีก' })
    } else setFeedback(result)
    setBusy(false)
  }

  const cardStyle = { background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #eee', borderRadius: 12, padding: '10px 12px' }
  const nameOf = (member: Member) => nameByAthlete[member.athlete_id] ?? 'นักกีฬา (ยังไม่มีอันดับในฤดูกาลนี้)'
  const feedbackLine = (value: Feedback | null) => value
    ? <p style={{ margin: '10px 0 0', color: value.tone === 'success' ? '#15803d' : '#b91c1c', fontSize: 13 }}>{value.text}</p>
    : null

  return <div style={{ display: 'grid', gap: 16 }}>
    {teams.length > 0 && <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><MailPlus size={18} color="#CC0001" /> เชิญนักกีฬาเข้าทีม</div>
      <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #ddd', marginBottom: 10 }}>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="อีเมลบัญชีนักกีฬา" type="email" style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #ddd' }} />
        <button onClick={invite} disabled={busy || !email || !selectedTeam} style={{ background: '#CC0001', color: 'white', border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800 }}>{busy ? 'กำลังส่ง' : 'เชิญ'}</button>
      </div>
      {feedbackLine(feedback)}
    </section>}

    {teams.length > 0 && <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 4 }}><Users size={18} color="#CC0001" /> รายชื่อสมาชิกของทีมนี้</div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>เฉพาะสมาชิกที่ &quot;เข้าร่วมแล้ว&quot; เท่านั้นที่เลือกได้ตอนบันทึกผลแข่ง</p>

      {pendingRequests.length > 0 && <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>คำขอเข้าทีม รออนุมัติ</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {pendingRequests.map(member => <div key={member.id} style={rowStyle}>
            <strong style={{ fontSize: 14 }}>{nameOf(member)}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => decide(member.id, 'approve')} disabled={busy} aria-label="อนุมัติคำขอเข้าทีม" style={{ border: 0, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: 8 }}><Check size={16} /></button>
              <button onClick={() => decide(member.id, 'decline')} disabled={busy} aria-label="ปฏิเสธคำขอเข้าทีม" style={{ border: 0, background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 8 }}><X size={16} /></button>
            </div>
          </div>)}
        </div>
      </div>}

      {acceptedMembers.length === 0 && pendingInvites.length === 0 && pendingRequests.length === 0
        ? <p style={{ color: '#888', fontSize: 14 }}>ยังไม่มีสมาชิกในทีมนี้ เชิญด้วยอีเมลด้านบนได้เลย</p>
        : <div style={{ display: 'grid', gap: 8 }}>
          {[...acceptedMembers, ...pendingInvites].map(member => <div key={member.id} style={rowStyle}>
            <div>
              <strong style={{ fontSize: 14 }}>{nameOf(member)}</strong>
              <div style={{ fontSize: 12, color: statusColor[member.status] ?? '#6b7280', fontWeight: 700 }}>{statusCopy[member.status] ?? member.status}</div>
            </div>
            {member.status === 'accepted' && <button onClick={() => remove(member.id)} disabled={busy} aria-label="นำสมาชิกออกจากทีม" style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #f2d0d0', background: 'white', color: '#CC0001', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 700 }}><UserMinus size={14} /> นำออก</button>}
          </div>)}
        </div>}

      {closedMembers.length > 0 && <div style={{ marginTop: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>ประวัติสมาชิก</div>
        <div style={{ display: 'grid', gap: 6 }}>
          {closedMembers.map(member => <div key={member.id} style={{ ...rowStyle, background: '#fafafa' }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{nameOf(member)}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: statusColor[member.status] ?? '#6b7280' }}>{statusCopy[member.status] ?? member.status}</span>
          </div>)}
        </div>
      </div>}
    </section>}

    {joinableTeams.length > 0 && <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 4 }}><LogIn size={18} color="#CC0001" /> ขอเข้าร่วมทีม</div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>ส่งคำขอได้ 1 ครั้งต่อทีมทุก 10 นาที ผู้จัดทีมจะเป็นผู้อนุมัติ</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={joinTeam} onChange={e => setJoinTeam(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #ddd' }}>
          {joinableTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <button onClick={requestJoin} disabled={busy || !joinTeam} style={{ background: '#111', color: 'white', border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800 }}>{busy ? 'กำลังส่ง' : 'ขอเข้าร่วม'}</button>
      </div>
      {feedbackLine(joinFeedback)}
    </section>}

    <section style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><Users size={18} color="#CC0001" /> คำเชิญและคำขอของฉัน</div>
      {feedbackLine(inviteFeedback)}
      {inviteState.length === 0 ? <p style={{ color: '#888', fontSize: 14 }}>ยังไม่มีคำเชิญเข้าทีม</p> : <div style={{ display: 'grid', gap: 10 }}>
        {inviteState.map(invite => <div key={invite.id} style={rowStyle}>
          <div>
            <strong>{teamLabels[invite.team_id] ?? invite.teams?.name ?? 'ทีมที่เชิญคุณ'}</strong>
            <div style={{ color: statusColor[invite.status] ?? '#888', fontSize: 12, fontWeight: 700 }}>
              {invite.direction === 'request' && invite.status === 'pending' ? 'คำขอของคุณ รอผู้จัดทีมอนุมัติ' : statusCopy[invite.status] ?? invite.status}
            </div>
          </div>
          {invite.status === 'pending' && invite.direction !== 'request' && <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => respond(invite.id, 'accepted')} disabled={busy} aria-label="ยอมรับคำเชิญ" style={{ border: 0, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: 8 }}><Check size={16} /></button>
            <button onClick={() => respond(invite.id, 'declined')} disabled={busy} aria-label="ปฏิเสธคำเชิญ" style={{ border: 0, background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 8 }}><X size={16} /></button>
          </div>}
        </div>)}
      </div>}
    </section>
  </div>
}
