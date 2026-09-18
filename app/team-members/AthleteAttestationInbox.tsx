'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { COACH_VERIFIED_FIELD_LABEL, POSITION_LABELS, coachTeamLabel, type AthleteAttestation } from '@/lib/coach-team-overview'
import { pendingButton, shouldStartAction } from '@/lib/pending-action'

const statusCopy = {
  pending: { label: 'รอคุณตอบ', background: '#fff7ed', color: '#9a3412' },
  accepted: { label: 'ยอมรับแล้ว', background: '#ecfdf5', color: '#166534' },
  declined: { label: 'ปฏิเสธแล้ว', background: '#fff1f1', color: '#b91c1c' },
} as const

// The athlete's side of the consent step. Only the athlete can answer, which SQL47
// enforces; this exists so they can actually see and answer it.
export default function AthleteAttestationInbox({ attestations }: { attestations: AthleteAttestation[] }) {
  const router = useRouter()
  const [pending, setPending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  if (attestations.length === 0) return null

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    if (!shouldStartAction(pending)) return
    setPending(`${status}:${id}`); setFeedback(null)
    const response = await fetch('/api/coach-attestations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'respond', id, data: { status } }),
    }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setPending(null)
    if (!response?.ok) {
      setFeedback({ tone: 'error', text: data?.error ?? 'ตอบคำรับรองไม่สำเร็จ กรุณาลองใหม่' })
      return
    }
    setFeedback({
      tone: 'success',
      text: status === 'accepted' ? `ยอมรับแล้ว ${COACH_VERIFIED_FIELD_LABEL}ของคุณได้รับการรับรองจากโค้ช` : 'ปฏิเสธคำรับรองแล้ว',
    })
    router.refresh()
  }

  return <section style={{ display: 'grid', gap: 10, marginBottom: 20 }}>
    <h2 style={{ margin: 0, font: '800 15px var(--font-oswald)', color: '#172033' }}>คำรับรอง{COACH_VERIFIED_FIELD_LABEL}จากโค้ช</h2>
    <p style={{ margin: 0, fontSize: 11, color: '#697586', lineHeight: 1.6 }}>
      โค้ชรับรองได้เฉพาะ{COACH_VERIFIED_FIELD_LABEL} ไม่รวมตัวบุคคล คะแนน สถิติ หรือผลการแข่งขัน คุณเท่านั้นที่ตอบได้ และจะมีผลเมื่อคุณกดยอมรับ
    </p>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '8px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534' }}>{feedback.text}</p>}

    {attestations.map(item => {
      const copy = statusCopy[item.status]
      const accept = pendingButton({ pending, key: `accepted:${item.id}`, idle: 'ยอมรับ', busy: 'กำลังยอมรับ...' })
      const decline = pendingButton({ pending, key: `declined:${item.id}`, idle: 'ปฏิเสธ', busy: 'กำลังปฏิเสธ...' })
      return <article key={item.id} style={{ background: '#fff', border: '1px solid #e2e5e9', borderRadius: 12, padding: 12, display: 'grid', gap: 7 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, alignItems: 'center' }}>
          <b style={{ fontSize: 13, color: '#172033' }}>{item.teamName}</b>
          <span style={{ background: copy.background, color: copy.color, borderRadius: 99, padding: '3px 8px', fontSize: 10, fontWeight: 900 }}>{copy.label}</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: '#3f4855' }}>
          {coachTeamLabel(item.teamName)} รับรองว่า{COACH_VERIFIED_FIELD_LABEL}ของคุณคือ <b>{POSITION_LABELS[item.claimedValue]}</b>
        </p>
        {item.status === 'pending' && <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <button
            type="button"
            aria-label={`ยอมรับการรับรอง${COACH_VERIFIED_FIELD_LABEL}จาก${item.teamName}`}
            aria-busy={accept['aria-busy']}
            disabled={accept.disabled}
            onClick={() => void respond(item.id, 'accepted')}
            style={{ border: 0, borderRadius: 8, background: '#166534', color: '#fff', fontSize: 11, fontWeight: 800, padding: '7px 11px', cursor: accept.disabled ? 'not-allowed' : 'pointer' }}
          >{accept.label}</button>
          <button
            type="button"
            aria-label={`ปฏิเสธการรับรอง${COACH_VERIFIED_FIELD_LABEL}จาก${item.teamName}`}
            aria-busy={decline['aria-busy']}
            disabled={decline.disabled}
            onClick={() => void respond(item.id, 'declined')}
            style={{ border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', fontSize: 11, fontWeight: 800, padding: '7px 11px', cursor: decline.disabled ? 'not-allowed' : 'pointer' }}
          >{decline.label}</button>
        </div>}
      </article>
    })}
  </section>
}
