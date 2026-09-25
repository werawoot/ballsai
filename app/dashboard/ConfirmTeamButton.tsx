'use client'

import { useRef, useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { requestErrorText, requestJson, shouldStartAction } from '@/lib/pending-action'

export default function ConfirmTeamButton({ teamId, action }: { teamId: string, action: 'confirmed' | 'rejected' }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  // `disabled` is render-time only; this refuses a second click synchronously.
  const inFlight = useRef<string | null>(null)

  const handleClick = async () => {
    if (!shouldStartAction(inFlight.current)) return
    inFlight.current = action
    setLoading(true)
    setMessage('')

    try {
      const outcome = await requestJson(`/api/teams/${teamId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      })

      if (!outcome.ok) {
        setMessage(requestErrorText(outcome, { fallback: 'อัปเดตสถานะทีมไม่สำเร็จ', mutating: true }))
        // The status may already have changed with only the response lost, so re-read
        // rather than leaving a stale button for the organizer to press again.
        if (outcome.kind === 'network') router.refresh()
        return
      }

      router.refresh()
    } finally {
      setLoading(false)
      inFlight.current = null
    }
  }

  const isConfirm = action === 'confirmed'

  return (
    <div style={{ flex: 1 }}>
      <button
        onClick={handleClick}
        disabled={loading}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: '10px',
          borderRadius: 10,
          border: 'none',
          cursor: loading ? 'default' : 'pointer',
          background: isConfirm ? '#CC0001' : '#f8f8f8',
          color: isConfirm ? 'white' : '#888',
          fontSize: 13,
          fontWeight: 800,
          fontFamily: 'var(--font-oswald)',
          letterSpacing: 0.5,
          opacity: loading ? 0.6 : 1,
        }}
      >
        {isConfirm ? <CheckCircle size={16} /> : <XCircle size={16} />}
        {loading ? '...' : isConfirm ? 'ยืนยัน' : 'ปฏิเสธ'}
      </button>
      {message ? (
        <p style={{ marginTop: 6, fontSize: 11, color: '#CC0001', textAlign: 'center' }}>{message}</p>
      ) : null}
    </div>
  )
}
