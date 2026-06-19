'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
  const nextStatus = status === 'open' ? 'closed' : 'open'
  const isOpen = status === 'open'

  const toggle = async () => {
    setLoading(true)
    setMessage('')

    const response = await fetch(`/api/tournaments/${tournamentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setMessage(data?.error ?? 'อัปเดตสถานะไม่สำเร็จ')
    } else {
      router.refresh()
    }

    setLoading(false)
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
