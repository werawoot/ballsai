'use client'

import { useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { requestJson, requestErrorText } from '@/lib/pending-action'

export default function DeletePlayerButton({ playerId }: { playerId: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const inFlight = useRef(false)
  // The ref refuses the next click synchronously; the state is what re-renders the
  // control as disabled, so the lock never depends on some other setState.
  const outcomeUnknown = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (inFlight.current || outcomeUnknown.current) return
    if (!confirm('ลบนักกีฬานี้?')) return
    inFlight.current = true
    setLoading(true)
    setMessage('')
    try {
      const result = await requestJson(`/api/admin/rankings/${playerId}`, { method: 'DELETE' })
      if (!result.ok) {
        if (result.kind === 'network') { outcomeUnknown.current = true; setNeedsReload(true) }
        setMessage(requestErrorText(result, { fallback: 'ลบ Ranking ไม่สำเร็จ', mutating: true }))
        return
      }
      router.refresh()
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  return (
    <div style={{ flex: 1 }}>
      <button onClick={handleDelete} disabled={loading || needsReload} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: 'white', color: '#CC0001', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-oswald)' }}>
        <Trash2 size={15} /> {loading ? '...' : 'ลบ'}
      </button>
      {needsReload && <button type="button" onClick={() => window.location.reload()} style={{ width: '100%', marginTop: 5, padding: 7, fontSize: 10, border: 0, borderRadius: 8, background: '#111', color: 'white', fontWeight: 800, cursor: 'pointer' }}>โหลดหน้าใหม่เพื่อตรวจว่าถูกลบแล้วหรือยัง</button>}
      {message && <small role="alert" style={{ color: '#a40000', display: 'block', fontSize: 10, marginTop: 5 }}>{message}</small>}
    </div>
  )
}
