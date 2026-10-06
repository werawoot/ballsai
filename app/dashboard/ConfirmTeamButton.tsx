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
    <div>
      <button className={`ui-btn ${isConfirm ? 'ui-btn-primary' : 'ui-btn-ghost'}`} onClick={handleClick} disabled={loading} type="button">
        {isConfirm ? <CheckCircle size={18} aria-hidden="true" /> : <XCircle size={18} aria-hidden="true" />}
        {loading ? '...' : isConfirm ? 'ยืนยัน' : 'ปฏิเสธ'}
      </button>
      {message ? (
        <p style={{ marginTop: 6, fontSize: 11, color: '#CC0001', textAlign: 'center' }}>{message}</p>
      ) : null}
    </div>
  )
}
