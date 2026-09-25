'use client'

import { useRef, useState } from 'react'
import { Flag } from 'lucide-react'
import { requestJson, requestErrorText } from '@/lib/pending-action'

// Anyone who can see a public athlete's clip can flag it. The reason is required so the
// admin queue has something to act on, and the button never hides the clip by itself.
export default function ReportHighlightButton({ highlightId }: { highlightId: number }) {
  const [state, setState] = useState<'idle' | 'sending' | 'done'>('idle')
  const [note, setNote] = useState('')
  const inFlight = useRef(false)
  // The ref refuses the next click synchronously; the state is what re-renders the
  // control as disabled, so the lock never depends on some other setState.
  const outcomeUnknown = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)

  const report = async () => {
    if (inFlight.current || outcomeUnknown.current) return
    const reason = window.prompt('รายงานเนื้อหานี้เพราะอะไร? (ทีมดูแลจะตรวจสอบ)')?.trim()
    if (!reason) return
    inFlight.current = true
    setState('sending')
    setNote('')
    try {
      const result = await requestJson(`/api/highlights/${highlightId}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      })
      if (!result.ok) {
        if (result.kind === 'network') { outcomeUnknown.current = true; setNeedsReload(true) }
        setState('idle')
        setNote(requestErrorText(result, { fallback: 'ส่งรายงานไม่สำเร็จ', mutating: true }))
        return
      }
      setState('done')
      setNote('ส่งรายงานแล้ว ทีมดูแลจะตรวจสอบ')
    } finally {
      inFlight.current = false
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {needsReload && <button type="button" onClick={() => window.location.reload()} style={{ padding: '4px 8px', fontSize: 10, border: 0, borderRadius: 8, background: '#111', color: 'white', fontWeight: 800, cursor: 'pointer' }}>โหลดหน้าใหม่เพื่อตรวจว่ารายงานถูกส่งแล้วหรือยัง</button>}
      <button
        onClick={report}
        disabled={state !== 'idle' || needsReload}
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
