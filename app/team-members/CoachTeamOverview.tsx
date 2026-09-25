import type { AttestationState, CoachTeamView } from '@/lib/coach-team-overview'
import CoachRosterActions from './CoachRosterActions'

const badge: Record<string, { label: string; background: string; color: string }> = {
  pending: { label: 'รอตอบรับ', background: '#fff7ed', color: '#9a3412' },
  accepted: { label: 'ตอบรับแล้ว', background: '#ecfdf5', color: '#166534' },
  declined: { label: 'ปฏิเสธ', background: '#fff1f1', color: '#b91c1c' },
}

// Read-only summary. Every roster mutation stays in TeamMembersClient, which calls the
// guarded RPCs; this panel exists so a coach can see state and what to do next.
export default function CoachTeamOverview({
  teams, rosterError = false, attestations = {}, attestationError = false,
}: {
  teams: CoachTeamView[]
  /** The roster query failed. An empty roster and a failed lookup must not look alike. */
  rosterError?: boolean
  /** Newest attestation state per athlete id, used to gate the attestation form. */
  attestations?: Record<string, AttestationState>
  attestationError?: boolean
}) {
  if (teams.length === 0) return null

  return <section style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
    {teams.map(team => <article key={team.id} style={{ background: '#fff', border: '1px solid #e2e5e9', borderRadius: 13, padding: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <b style={{ fontSize: 15, color: '#172033' }}>{team.name}</b>
        {team.tournamentName && <span style={{ background: '#f7f7f5', borderRadius: 99, padding: '4px 9px', fontSize: 11, fontWeight: 800, color: '#546070' }}>{team.tournamentName}</span>}
        <span style={{ background: team.canManageRoster ? '#fff7ed' : '#eef2ff', color: team.canManageRoster ? '#9a3412' : '#3730a3', borderRadius: 99, padding: '4px 9px', fontSize: 11, fontWeight: 900 }}>
          {team.canManageRoster ? 'แก้รายชื่อได้' : 'ส่งรายชื่อแล้ว'}
        </span>
      </div>

      <p style={{ margin: '9px 0 0', fontSize: 12, fontWeight: 800, color: '#166534' }}>ขั้นต่อไป: {team.nextAction}</p>

      <p style={{ margin: '8px 0 0', fontSize: 11, color: '#697586' }}>
        ตอบรับ {team.counts.accepted} · รอตอบรับ {team.counts.pending} · ปฏิเสธ {team.counts.declined} · นำออกแล้ว {team.counts.removed}
      </p>

      {/* A failed lookup is reported, never rendered as an empty or anonymous roster:
          a coach must not conclude their team is empty because a query broke. */}
      {rosterError
        ? <p role="alert" style={{ margin: '9px 0 0', padding: '8px 10px', borderRadius: 8, background: '#fff1f1', color: '#b91c1c', fontSize: 11, fontWeight: 700, lineHeight: 1.6 }}>
            โหลดรายชื่อสมาชิกไม่สำเร็จ ตัวเลขและรายชื่อด้านล่างอาจไม่ครบ กรุณาโหลดหน้าใหม่ ถ้ายังไม่หายให้แจ้งทีมงาน
          </p>
        : team.members.length === 0 && <p style={{ margin: '9px 0 0', fontSize: 11, color: '#697586' }}>ยังไม่มีสมาชิกในทีมนี้</p>}

      {team.members.length > 0 && <ul style={{ margin: '9px 0 0', padding: 0, listStyle: 'none', display: 'grid', gap: 5 }}>
        {team.members.map(member => <li key={member.id} style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12, color: '#3f4855' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{member.name}</span>
          <span style={{ background: badge[member.status]?.background ?? '#f7f7f5', color: badge[member.status]?.color ?? '#546070', borderRadius: 99, padding: '3px 8px', fontSize: 10, fontWeight: 900 }}>
            {badge[member.status]?.label ?? member.status}
          </span>
        </li>)}
      </ul>}

      {!rosterError && <CoachRosterActions teamId={team.id} members={team.members} canManageRoster={team.canManageRoster} attestations={attestations} attestationError={attestationError} />}

      {/* Stated rather than offered: these belong to the tournament organizer, and a
          coach pressing a control for them would only be refused. */}
      <p style={{ margin: '10px 0 0', fontSize: 11, color: '#697586', lineHeight: 1.6 }}>
        สิ่งที่ผู้จัดรายการหรือผู้ดูแลระบบทำ ไม่ใช่โค้ช: {team.organizerOnly.join(' · ')}
      </p>
    </article>)}
  </section>
}
