'use client'

import { useState } from 'react'
import { Flag } from 'lucide-react'

// Anyone who can see a public athlete's clip can flag it. The reason is required so the
// admin queue has something to act on, and the button never hides the clip by itself.
export default function ReportHighlightButton({ highlightId }: { highlightId: number }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [note, setNote] = useState('')

  const report = async () => {
    const reason = window.prompt('รายงานเนื้อหานี้เพราะอะไร? (ทีมดูแลจะตรวจสอบ)')?.trim()
    if (!reason) return
    setState('sending')
    setNote('')
    const response = await fetch(`/api/highlights/${highlightId}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    if (!response.ok) {
      setState('idle')
      setNote(payload?.error ?? 'ส่งรายงานไม่สำเร็จ')
      return
    }
    setState('done')
    setNote('ส่งรายงานแล้ว ทีมดูแลจะตรวจสอบ')
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <button
        onClick={report}
        disabled={state !== 'idle'}
        title="รายงานเนื้อหาไม่เหมาะสม"
        aria-label="รายงานเนื้อหาไม่เหมาะสม"
        style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'transparent', border: 'none', color: state === 'done' ? '#16a34a' : '#999', fontSize: 11, fontWeight: 700, cursor: state === 'idle' ? 'pointer' : 'default', padding: 4 }}
      >
        <Flag size={13} />
      </button>
      {note && <small style={{ fontSize: 10, color: state === 'done' ? '#16a34a' : '#CC0001', maxWidth: 150, lineHeight: 1.3 }}>{note}</small>}
    </span>
  )
}
