'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  COACH_VERIFIED_FIELD_LABEL, POSITION_LABELS, attestationGate, attestationKey,
  removeNeedsConfirmation, type AttestationState, type CoachTeamView,
} from '@/lib/coach-team-overview'
import { pendingButton, shouldStartAction } from '@/lib/pending-action'

type Member = CoachTeamView['members'][number]

// Coach-only roster work. Everything here is authorised inside the SQL47 RPCs by the
// team-creator relationship; this component sends ids and never an actor identity.
export default function CoachRosterActions({
  teamId, members, canManageRoster, attestations = {}, attestationError = false,
}: {
  teamId: string
  members: Member[]
  canManageRoster: boolean
  /** Newest attestation state per athlete id. */
  attestations?: Record<string, AttestationState>
  /** The attestation lookup failed; offering a form would risk a duplicate. */
  attestationError?: boolean
}) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  if (!canManageRoster) {
    return <p style={{ margin: '9px 0 0', fontSize: 11, color: '#697586' }}>ส่งรายชื่อแล้ว แก้รายชื่อไม่ได้จนกว่าผู้จัดรายการจะเปิดให้แก้</p>
  }

  const call = async (key: string, url: string, body: unknown, done: string) => {
    if (!shouldStartAction(pending)) return
    setPending(key); setFeedback(null)
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setPending(null)
    if (!response?.ok) {
      setFeedback({ tone: 'error', text: data?.error ?? 'ทำรายการไม่สำเร็จ กรุณาลองใหม่' })
      return
    }
    setFeedback({ tone: 'success', text: done })
    router.refresh()
  }

  return <div style={{ marginTop: 10, display: 'grid', gap: 9 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534' }}>{feedback.text}</p>}

    {attestationError && <p role="alert" style={{ margin: 0, padding: '8px 10px', borderRadius: 8, background: '#fff1f1', color: '#b91c1c', fontSize: 11, fontWeight: 700, lineHeight: 1.6 }}>
      โหลดสถานะคำรับรองไม่สำเร็จ จึงยังส่งคำรับรองใหม่ไม่ได้ กรุณาโหลดหน้าใหม่
    </p>}

    {members.map(member => {
      const remove = pendingButton({ pending, key: `remove:${member.id}`, idle: 'นำออกจากทีม', busy: 'กำลังนำออก...' })
      const attest = pendingButton({ pending, key: `attest:${member.id}`, idle: `รับรอง${COACH_VERIFIED_FIELD_LABEL}`, busy: 'กำลังส่งคำรับรอง...' })
      // A failed lookup is treated as "unknown", which blocks the form: posting blind
      // risks a duplicate SQL47 would refuse anyway.
      const gate = attestationError
        ? { canSubmit: false, state: 'none' as const, reason: null }
        // Keyed by team as well: this team has exactly one attesting coach, but the
        // same athlete may also be on a different team with a different creator.
        : attestationGate(member.status, attestations[attestationKey(teamId, member.athleteId, 'playing_position')])
      const needsConfirm = removeNeedsConfirmation(member.status)
      const askingConfirm = confirming === member.id
      return <div key={member.id} style={{ border: '1px solid #eceff3', borderRadius: 10, padding: 10, display: 'grid', gap: 7 }}>
        <b style={{ fontSize: 13, color: '#172033' }}>{member.name}</b>

        {gate.reason && <p style={{ margin: 0, fontSize: 11, color: gate.state === 'accepted' ? '#166534' : '#9a3412', fontWeight: 700 }}>{gate.reason}</p>}

        {/* Removing someone who accepted undoes a decision they made, so it asks first.
            An unanswered or declined invitation carries no such decision. */}
        {askingConfirm
          ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <span role="status" aria-live="polite" style={{ fontSize: 11, color: '#b91c1c', fontWeight: 700 }}>นำ{member.name}ออกจากทีมจริงไหม? นักกีฬาจะไม่อยู่ในรายชื่อนี้อีก</span>
              <button
                type="button"
                aria-label={`ยืนยันนำ${member.name}ออกจากทีม`}
                aria-busy={remove['aria-busy']}
                disabled={remove.disabled}
                onClick={() => { setConfirming(null); void call(`remove:${member.id}`, '/api/coach-management', { action: 'remove', id: teamId, data: { memberId: member.id } }, 'นำออกจากทีมแล้ว') }}
                style={{ border: 0, borderRadius: 8, background: '#b91c1c', color: '#fff', fontSize: 11, fontWeight: 800, padding: '6px 9px', cursor: remove.disabled ? 'not-allowed' : 'pointer' }}
              >ยืนยันนำออก</button>
              <button
                type="button"
                aria-label={`ยกเลิกการนำ${member.name}ออกจากทีม`}
                onClick={() => setConfirming(null)}
                style={{ border: '1px solid #d9dde2', borderRadius: 8, background: '#fff', color: '#3f4855', fontSize: 11, fontWeight: 800, padding: '6px 9px', cursor: 'pointer' }}
              >ยกเลิก</button>
            </div>
          : <button
              type="button"
              aria-label={needsConfirm ? `นำ${member.name}ออกจากทีม ต้องยืนยันก่อน` : `นำ${member.name}ออกจากทีม`}
              aria-busy={remove['aria-busy']}
              disabled={remove.disabled}
              onClick={() => needsConfirm
                ? setConfirming(member.id)
                : void call(`remove:${member.id}`, '/api/coach-management', { action: 'remove', id: teamId, data: { memberId: member.id } }, 'นำออกจากทีมแล้ว')}
              style={{ justifySelf: 'start', border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 800, padding: '6px 9px', cursor: remove.disabled ? 'not-allowed' : 'pointer' }}
            >{remove.label}</button>}

        {/* Offered only when the gate allows it: an accepted member with no pending or
            accepted attestation. A declined one may be attested again. */}
        {gate.canSubmit && <form
          onSubmit={event => {
            event.preventDefault()
            const position = new FormData(event.currentTarget).get('position')
            void call(`attest:${member.id}`, '/api/coach-attestations',
              { action: 'create', id: teamId, data: { athleteId: member.athleteId, position } },
              'ส่งคำรับรองแล้ว รอนักกีฬายอมรับ')
          }}
          style={{ display: 'grid', gap: 6 }}
        >
          <label style={{ fontSize: 11, fontWeight: 800, color: '#546070' }}>
            {COACH_VERIFIED_FIELD_LABEL}ของ{member.name}
            <select name="position" required defaultValue="" style={{ display: 'block', marginTop: 4, padding: '6px 8px', borderRadius: 8, border: '1px solid #d9dde2', fontSize: 12 }}>
              <option value="" disabled>เลือกตำแหน่ง</option>
              {Object.entries(POSITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <p style={{ margin: 0, fontSize: 10, color: '#697586', lineHeight: 1.6 }}>
            คำรับรองนี้ยืนยันเฉพาะ{COACH_VERIFIED_FIELD_LABEL} ไม่ได้ยืนยันตัวบุคคล คะแนน สถิติ หรือข้อมูลอื่นในโปรไฟล์ และจะมีผลเมื่อนักกีฬากดยอมรับเท่านั้น
          </p>
          <button
            aria-label={`รับรอง${COACH_VERIFIED_FIELD_LABEL}ของ${member.name}`}
            aria-busy={attest['aria-busy']}
            disabled={attest.disabled}
            style={{ justifySelf: 'start', border: 0, borderRadius: 8, background: '#101827', color: '#fff', fontSize: 11, fontWeight: 800, padding: '7px 10px', cursor: attest.disabled ? 'not-allowed' : 'pointer' }}
          >{attest.label}</button>
        </form>}
      </div>
    })}
  </div>
}
