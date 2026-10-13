import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { AttestationState, CoachTeamView } from '@/lib/coach-team-overview'
import CoachRosterActions from './CoachRosterActions'
import KeepTeamButton from './KeepTeamButton'

const badge: Record<string, { label: string; tone: string }> = {
  pending: { label: 'รอตอบรับ', tone: 'is-wait' },
  accepted: { label: 'ตอบรับแล้ว', tone: 'is-ok' },
  declined: { label: 'ปฏิเสธ', tone: 'is-no' },
}

// One card per team the coach created: where it stands, the one next step, and the way
// into the team page (events, news, plans, notes, minutes, staff). The roster and the
// roster actions fold away so the card stays short. Every roster mutation stays in
// TeamMembersClient and CoachRosterActions, which call the guarded RPCs.
export default function CoachTeamOverview({
  teams, rosterError = false, attestations = {}, attestationError = false, statsLabel, myTeamLabel, canKeep = false,
}: {
  teams: CoachTeamView[]
  /** The roster query failed. An empty roster and a failed lookup must not look alike. */
  rosterError?: boolean
  /** Newest attestation state per athlete id, used to gate the attestation form. */
  attestations?: Record<string, AttestationState>
  attestationError?: boolean
  /** Label of the link to the team page (/team-members/[teamId]). */
  statsLabel?: string
  /** Chip on a coach's own team (sql/78). */
  myTeamLabel?: string
  /** SQL78 is in: a tournament team can be kept as my team (D2). */
  canKeep?: boolean
}) {
  if (teams.length === 0) return null

  return <div className="tm-teams">
    {teams.map(team => <article key={team.id} className="ui-card tm-team">
      <div className="tm-team-top">
        <div className="tm-team-name">
          <b>{team.name}</b>
          {team.tournamentName && <small>{team.tournamentName}</small>}
        </div>
        {team.isClub
          ? <span className="tm-chip is-club">{myTeamLabel}</span>
          : <span className={`tm-chip ${team.canManageRoster ? 'is-wait' : 'is-ok'}`}>{team.canManageRoster ? 'กำลังรวมรายชื่อ' : 'ส่งรายชื่อแล้ว'}</span>}
      </div>

      <dl className="tm-stats">
        <div><dt>ตอบรับ</dt><dd>{team.counts.accepted}</dd></div>
        <div><dt>รอตอบ</dt><dd>{team.counts.pending}</dd></div>
        <div><dt>ปฏิเสธ</dt><dd>{team.counts.declined}</dd></div>
      </dl>

      <p className="tm-next"><span>ขั้นต่อไป</span>{team.nextAction}</p>

      {/* A failed lookup is reported, never rendered as an empty or anonymous roster:
          a coach must not conclude their team is empty because a query broke. */}
      {rosterError && <p role="alert" className="tp-alert">
        โหลดรายชื่อสมาชิกไม่สำเร็จ ตัวเลขและรายชื่ออาจไม่ครบ กรุณาโหลดหน้าใหม่ ถ้ายังไม่หายให้แจ้งทีมงาน
      </p>}

      {statsLabel && <Link href={`/team-members/${team.id}`} className="ui-btn ui-btn-primary tm-open">{statsLabel}<ChevronRight size={18} aria-hidden="true" /></Link>}
      {canKeep && !team.isClub && <div className="tm-keep"><KeepTeamButton teamId={team.id} /></div>}

      {!rosterError && <details className="tm-fold">
        <summary>รายชื่อนักกีฬา ({team.members.length})</summary>
        {team.members.length === 0
          ? <p className="tp-note">ยังไม่มีสมาชิกในทีมนี้</p>
          : <ul className="tm-roster">
              {team.members.map(member => <li key={member.id}>
                <span>{member.name}</span>
                <span className={`tm-chip ${badge[member.status]?.tone ?? ''}`}>{badge[member.status]?.label ?? member.status}</span>
              </li>)}
            </ul>}
        <CoachRosterActions teamId={team.id} members={team.members} canManageRoster={team.canManageRoster} attestations={attestations} attestationError={attestationError} />
        {team.counts.removed > 0 && <p className="tp-note">นำออกแล้ว {team.counts.removed} คน</p>}
      </details>}

      {/* Stated rather than offered: these belong to the tournament organizer, and a
          coach pressing a control for them would only be refused. */}
      {!team.isClub && <details className="tm-fold is-quiet">
        <summary>งานที่ผู้จัดรายการทำ ไม่ใช่โค้ช</summary>
        <p className="tp-note">{team.organizerOnly.join(' · ')}</p>
      </details>}
    </article>)}
  </div>
}
