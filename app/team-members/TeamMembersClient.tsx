'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, LogIn, MailPlus, UserMinus, Users, X } from 'lucide-react'
import Link from 'next/link'
import { requestErrorText, requestJson } from '@/lib/pending-action'
import { offersReasonedRemoval } from '@/lib/team-roster'

type TournamentRelation = { name: string | null } | { name: string | null }[] | null
/**
 * `managedAs` says why this account may manage the team: it created it (main's coach
 * flow, which also owns submitting the team), or it organizes the tournament the team
 * entered (beta: invite_team_member and remove_team_member both accept the organizer).
 */
type Team = { id: string; name: string; tournament_id: string; status: string; tournaments?: TournamentRelation; managedAs?: 'creator' | 'organizer' }
/** `direction` (sql/24) tells an invite the team sent apart from a request the athlete sent. */
type Member = { id: string; team_id: string; athlete_id: string; status: string; direction?: string | null; invited_at: string; teams?: { name: string | null } | null }
type Feedback = { tone: 'success' | 'error'; text: string }

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
  /** Memberships of the teams in `teams`, for approving requests and removing members. */
  members?: Member[]
  /** Teams this athlete may ask to join, from list_joinable_teams() (sql/25). */
  joinableTeams?: { id: string; name: string }[]
  /** Team display names the athlete is entitled to see, from list_my_team_labels(). */
  teamLabels?: Record<string, string>
  /** Names from player_ranks (public read), never from profiles. */
  nameByAthlete?: Record<string, string>
}) {
  const [selectedTeam, setSelectedTeam] = useState(teams[0]?.id ?? '')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [inviteMessage, setInviteMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [inviteState, setInviteState] = useState(invites)
  const [memberState, setMemberState] = useState(members)
  const [rosterFeedback, setRosterFeedback] = useState<Feedback | null>(null)
  const [joinTeam, setJoinTeam] = useState(joinableTeams[0]?.id ?? '')
  const [joinFeedback, setJoinFeedback] = useState<Feedback | null>(null)
  const inFlight = useRef(false)
  const outcomeUnknown = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)
  const router = useRouter()

  const start = () => {
    if (inFlight.current || outcomeUnknown.current) return false
    inFlight.current = true
    setBusy(true)
    return true
  }
  const finish = () => { inFlight.current = false; setBusy(false) }
  const showFailure = (outcome: { kind: 'network' } | { kind: 'http'; status: number; error: string | null }, fallback: string) => {
    if (outcome.kind === 'network') {
      outcomeUnknown.current = true
      setNeedsReload(true)
    }
    return requestErrorText({ ok: false, ...outcome }, { fallback, mutating: true })
  }

  const invite = async () => {
    if (!start()) return
    setMessage('')
    try {
      const outcome = await requestJson(`/api/teams/${selectedTeam}/members`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
      if (!outcome.ok) { setMessage(showFailure(outcome, 'ส่งคำเชิญไม่สำเร็จ')); return }
      setMessage('ส่งคำเชิญแล้ว')
      setEmail('')
    } finally { finish() }
  }

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (!start()) return
    setInviteMessage('')
    try {
      const outcome = await requestJson(`/api/team-members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      if (!outcome.ok) { setInviteMessage(showFailure(outcome, 'อัปเดตคำเชิญไม่สำเร็จ')); return }
      setInviteState(items => items.map(item => item.id === id ? { ...item, status } : item))
      setInviteMessage(status === 'accepted' ? 'รับคำเชิญแล้ว คุณจะถูกเลือกลงผลแข่งให้ทีมนี้ได้เมื่อทีมได้รับการยืนยัน' : 'ปฏิเสธคำเชิญแล้ว')
    } finally { finish() }
  }

  const submitTeam = async () => {
    const team = teams.find(item => item.id === selectedTeam)
    if (!team) return
    if (!start()) return
    setMessage('')
    try {
      const outcome = await requestJson(`/api/teams/${team.id}/submit`, { method: 'POST' })
      if (!outcome.ok) { setMessage(showFailure(outcome, 'ส่งสมัครทีมไม่สำเร็จ')); return }
      router.push(`/tournaments/${team.tournament_id}?teamId=${encodeURIComponent(team.id)}`)
    } finally { finish() }
  }

  // Beta: approve or decline a join request (approve_team_request / decline_team_request).
  const decide = async (id: string, action: 'approve' | 'decline') => {
    if (!start()) return
    setRosterFeedback(null)
    try {
      const outcome = await requestJson(`/api/team-members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      if (!outcome.ok) { setRosterFeedback({ tone: 'error', text: showFailure(outcome, 'อัปเดตคำขอเข้าทีมไม่สำเร็จ') }); return }
      setMemberState(items => items.map(item => item.id === id ? { ...item, status: action === 'approve' ? 'accepted' : 'declined' } : item))
      setRosterFeedback({ tone: 'success', text: action === 'approve' ? 'อนุมัติเข้าทีมแล้ว' : 'ปฏิเสธคำขอแล้ว' })
    } finally { finish() }
  }

  // Beta: remove with a recorded reason (remove_team_member). Offered only where main's
  // coach removal cannot act -- see `offersReasonedRemoval` below.
  const remove = async (id: string) => {
    if (inFlight.current || outcomeUnknown.current) return
    const reason = window.prompt('เหตุผลการนำสมาชิกออก (10–500 ตัวอักษร) จะถูกบันทึกไว้ในระบบ')
    if (reason === null) return
    if (!start()) return
    setRosterFeedback(null)
    try {
      const outcome = await requestJson(`/api/team-members/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', reason }) })
      if (!outcome.ok) { setRosterFeedback({ tone: 'error', text: showFailure(outcome, 'นำสมาชิกออกไม่สำเร็จ') }); return }
      // Removed members leave the selectable match-result roster immediately; results
      // already confirmed keep their own membership snapshot.
      setMemberState(items => items.map(item => item.id === id ? { ...item, status: 'removed' } : item))
      setRosterFeedback({ tone: 'success', text: 'นำสมาชิกออกแล้ว จะเลือกในหน้าบันทึกผลไม่ได้อีก' })
    } finally { finish() }
  }

  // Beta: ask to join a team (sql/25). The team's manager approves it above.
  const requestJoin = async () => {
    if (!joinTeam || !start()) return
    setJoinFeedback(null)
    try {
      const outcome = await requestJson(`/api/teams/${joinTeam}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      if (!outcome.ok) { setJoinFeedback({ tone: 'error', text: showFailure(outcome, 'ส่งคำขอเข้าร่วมทีมไม่สำเร็จ') }); return }
      setJoinFeedback({ tone: 'success', text: 'ส่งคำขอแล้ว รอผู้จัดทีมอนุมัติ' })
    } finally { finish() }
  }

  const selected = teams.find(team => team.id === selectedTeam)
  const teamMembers = memberState.filter(member => member.team_id === selectedTeam)
  const pendingRequests = teamMembers.filter(member => member.status === 'pending' && member.direction === 'request')
  const acceptedMembers = teamMembers.filter(member => member.status === 'accepted')
  // One way to remove a member, never two: see offersReasonedRemoval in lib/team-roster.ts.
  const reasonedRemoval = offersReasonedRemoval(selected)
  const nameOf = (member: Member) => nameByAthlete[member.athlete_id] ?? 'นักกีฬา (ยังไม่มีอันดับในฤดูกาลนี้)'
  const feedbackLine = (value: Feedback | null) => value
    ? <p role="status" style={{ margin: '10px 0 0', color: value.tone === 'success' ? '#15803d' : '#b91c1c', fontSize: 13 }}>{value.text}</p>
    : null
  const rowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #eee', borderRadius: 12, padding: '10px 12px' }
  const selectedTournament = selected?.tournaments
  const selectedTournamentName = Array.isArray(selectedTournament)
    ? selectedTournament[0]?.name
    : selectedTournament?.name

  return <div style={{ display: 'grid', gap: 16 }}>
    {needsReload && <button type="button" onClick={() => window.location.reload()}>โหลดหน้าใหม่เพื่อตรวจสถานะก่อนทำรายการต่อ</button>}
    {teams.length > 0 && <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><MailPlus size={18} color="#CC0001" /> เชิญนักกีฬาเข้าทีม</div>
      <select value={selectedTeam} onChange={e => setSelectedTeam(e.target.value)} style={{ width: '100%', padding: 11, borderRadius: 10, border: '1px solid #ddd', marginBottom: 10 }}>
        {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="อีเมลบัญชีนักกีฬา" type="email" style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #ddd' }} />
        <button onClick={invite} disabled={busy || needsReload || !email || !selectedTeam} style={{ background: '#CC0001', color: 'white', border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800 }}>{busy ? 'กำลังส่ง' : 'เชิญ'}</button>
      </div>
      {message && <p style={{ margin: '10px 0 0', color: message === 'ส่งคำเชิญแล้ว' ? '#15803d' : '#b91c1c', fontSize: 13 }}>{message}</p>}
      {selected?.status === 'draft' && selected.managedAs !== 'organizer' && <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid #eee' }}><p style={{ color: '#666', fontSize: 13, lineHeight: 1.5, marginBottom: 10 }}>เมื่อนักกีฬาอย่างน้อยหนึ่งคนตอบรับแล้ว ส่งสมัครรายการเพื่อไปขั้นชำระเงิน</p><button onClick={submitTeam} disabled={busy || needsReload} style={{ background: '#172033', color: 'white', border: 0, borderRadius: 10, padding: '10px 14px', fontWeight: 800 }}>{busy ? 'กำลังส่ง...' : 'ส่งสมัครรายการ'}</button></div>}
      {selected && <p style={{ color: '#888', fontSize: 12, marginTop: 10 }}>รายการ: {selectedTournamentName ?? '—'} · สถานะ: {selected.status === 'draft' ? 'กำลังจัด roster' : selected.status === 'pending' ? 'รอตรวจสอบ' : selected.status === 'confirmed' ? 'ยืนยันแล้ว' : 'ไม่ผ่าน'}</p>}
    </section>}

    {selected && (pendingRequests.length > 0 || (reasonedRemoval && acceptedMembers.length > 0)) && <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 4 }}><Users size={18} color="#CC0001" /> จัดการสมาชิก · {selected.name}</div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>เฉพาะสมาชิกที่ &quot;เข้าร่วมแล้ว&quot; เท่านั้นที่เลือกได้ตอนบันทึกผลแข่ง</p>
      {pendingRequests.length > 0 && <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 6 }}>คำขอเข้าทีม รออนุมัติ</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {pendingRequests.map(member => <div key={member.id} style={rowStyle}>
            <strong style={{ fontSize: 14 }}>{nameOf(member)}</strong>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => decide(member.id, 'approve')} disabled={busy || needsReload} aria-label="อนุมัติคำขอเข้าทีม" style={{ border: 0, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: 8 }}><Check size={16} /></button>
              <button onClick={() => decide(member.id, 'decline')} disabled={busy || needsReload} aria-label="ปฏิเสธคำขอเข้าทีม" style={{ border: 0, background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 8 }}><X size={16} /></button>
            </div>
          </div>)}
        </div>
      </div>}
      {reasonedRemoval && acceptedMembers.length > 0 && <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: '#6b7280', marginBottom: 6 }}>นำสมาชิกออก (ต้องระบุเหตุผล ระบบจะบันทึกไว้)</div>
        <div style={{ display: 'grid', gap: 8 }}>
          {acceptedMembers.map(member => <div key={member.id} style={rowStyle}>
            <strong style={{ fontSize: 14 }}>{nameOf(member)}</strong>
            <button onClick={() => remove(member.id)} disabled={busy || needsReload} aria-label={`นำ ${nameOf(member)} ออกจากทีม`} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #fecaca', background: '#fff', color: '#b91c1c', borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 800 }}><UserMinus size={14} /> นำออก</button>
          </div>)}
        </div>
      </div>}
      {feedbackLine(rosterFeedback)}
    </section>}

    {joinableTeams.length > 0 && <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 4 }}><LogIn size={18} color="#CC0001" /> ขอเข้าร่วมทีม</div>
      <p style={{ color: '#888', fontSize: 12, margin: '0 0 12px' }}>ส่งคำขอได้ 1 ครั้งต่อทีมทุก 10 นาที ผู้จัดทีมจะเป็นผู้อนุมัติ</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <select value={joinTeam} onChange={e => setJoinTeam(e.target.value)} style={{ flex: 1, padding: 11, borderRadius: 10, border: '1px solid #ddd' }}>
          {joinableTeams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
        <button onClick={requestJoin} disabled={busy || needsReload || !joinTeam} style={{ background: '#111', color: 'white', border: 0, borderRadius: 10, padding: '0 16px', fontWeight: 800 }}>{busy ? 'กำลังส่ง' : 'ขอเข้าร่วม'}</button>
      </div>
      {feedbackLine(joinFeedback)}
    </section>}

    <section style={{ background: 'white', borderRadius: 16, padding: 18, border: '1px solid #e5e7eb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 12 }}><Users size={18} color="#CC0001" /> คำเชิญและคำขอของฉัน</div>
      {inviteState.length === 0 ? <div><p style={{ color: '#888', fontSize: 14, lineHeight: 1.55 }}>ยังไม่มีคำเชิญเข้าทีม ดูรายการที่สนใจ แล้วให้โค้ชหรือผู้จัดสร้างทีมและเชิญด้วยอีเมลบัญชีนี้</p><Link href="/tournaments" style={{ display: 'inline-block', marginTop: 4, color: '#CC0001', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>ค้นหารายการแข่ง →</Link></div> : <div style={{ display: 'grid', gap: 10 }}>
        {inviteState.map(invite => <div key={invite.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
          <div><strong>{teamLabels[invite.team_id] ?? invite.teams?.name ?? 'ทีมของคุณ'}</strong><div style={{ color: '#888', fontSize: 12 }}>{invite.direction === 'request' && invite.status === 'pending' ? 'คำขอของคุณ รอผู้จัดทีมอนุมัติ' : invite.status === 'pending' ? 'รอการตอบรับ' : invite.status === 'accepted' ? 'เข้าร่วมแล้ว' : invite.status === 'removed' ? 'ถูกนำออกแล้ว' : 'ปฏิเสธแล้ว'}</div></div>
          {invite.status === 'pending' && invite.direction !== 'request' && <div style={{ display: 'flex', gap: 6 }}><button onClick={() => respond(invite.id, 'accepted')} disabled={busy || needsReload} aria-label="ยอมรับคำเชิญ" style={{ border: 0, background: '#dcfce7', color: '#166534', borderRadius: 8, padding: 8 }}><Check size={16} /></button><button onClick={() => respond(invite.id, 'declined')} disabled={busy || needsReload} aria-label="ปฏิเสธคำเชิญ" style={{ border: 0, background: '#fee2e2', color: '#991b1b', borderRadius: 8, padding: 8 }}><X size={16} /></button></div>}
        </div>)}
      </div>}
      {inviteMessage && <div style={{ marginTop: 12, background: inviteMessage.includes('ไม่สำเร็จ') || needsReload ? '#fef2f2' : '#f0fdf4', color: inviteMessage.includes('ไม่สำเร็จ') || needsReload ? '#b91c1c' : '#166534', borderRadius: 10, padding: '10px 12px', fontSize: 13, lineHeight: 1.5 }}>{inviteMessage}{inviteMessage.startsWith('รับคำเชิญแล้ว') && <Link href="/career" style={{ display: 'block', marginTop: 5, color: 'inherit', fontWeight: 800 }}>ดู Athlete Passport →</Link>}</div>}
    </section>
  </div>
}
