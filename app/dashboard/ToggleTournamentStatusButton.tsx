'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { requestErrorText, requestJson, shouldStartAction } from '@/lib/pending-action'
import { Lock, Unlock } from 'lucide-react'

export default function ToggleTournamentStatusButton({
  tournamentId,
  status,
}: {
  tournamentId: string
  status: string
}) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const inFlight = useRef<string | null>(null)
  const nextStatus = status === 'open' ? 'closed' : 'open'
  const isOpen = status === 'open'

  const toggle = async () => {
    if (!shouldStartAction(inFlight.current)) return
    inFlight.current = nextStatus
    setLoading(true)
    setMessage('')

    try {
      const outcome = await requestJson(`/api/tournaments/${tournamentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })

      if (!outcome.ok) {
        setMessage(requestErrorText(outcome, { fallback: 'อัปเดตสถานะไม่สำเร็จ', mutating: true }))
        // A blind second toggle would flip the status back, so re-read the real state.
        if (outcome.kind === 'network') router.refresh()
        return
      }

      router.refresh()
    } finally {
      setLoading(false)
      inFlight.current = null
    }
  }

  return (
    <div style={{ flex: 1 }}>
      <button
        onClick={toggle}
        disabled={loading}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: isOpen ? '#111' : '#16a34a', color: 'white', border: 'none', borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 800, cursor: loading ? 'default' : 'pointer', fontFamily: 'var(--font-oswald)' }}
      >
        {isOpen ? <Lock size={14} /> : <Unlock size={14} />}
        {loading ? 'กำลังบันทึก...' : isOpen ? 'ปิดรับสมัคร' : 'เปิดรับสมัคร'}
      </button>
      {message && <div style={{ marginTop: 6, fontSize: 11, color: '#CC0001', fontWeight: 700 }}>{message}</div>}
    </div>
  )
}
