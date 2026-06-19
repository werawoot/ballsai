'use client'

import { useState } from 'react'
import { CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ConfirmTeamButton({ teamId, action }: { teamId: string, action: 'confirmed' | 'rejected' }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const handleClick = async () => {
    setLoading(true)
    setMessage('')

    const response = await fetch(`/api/teams/${teamId}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action }),
    })

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setMessage(data?.error ?? 'อัปเดตสถานะทีมไม่สำเร็จ')
      setLoading(false)
      return
    }

    setLoading(false)
    router.refresh()
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
