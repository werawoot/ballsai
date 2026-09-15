'use client'

import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DeletePlayerButton({ playerId }: { playerId: string }) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('ลบนักกีฬานี้?')) return
    setLoading(true)
    setMessage('')
    const response = await fetch(`/api/admin/rankings/${playerId}`, { method: 'DELETE' })
    const payload = await response.json().catch(() => null) as { error?: string } | null
    setLoading(false)
    if (!response.ok) {
      setMessage(payload?.error ?? 'ลบ Ranking ไม่สำเร็จ')
      return
    }
    router.refresh()
  }

  return (
    <div style={{ flex: 1 }}>
      <button onClick={handleDelete} disabled={loading} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: 'white', color: '#CC0001', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-oswald)' }}>
        <Trash2 size={15} /> {loading ? '...' : 'ลบ'}
      </button>
      {message && <small role="alert" style={{ color: '#a40000', display: 'block', fontSize: 10, marginTop: 5 }}>{message}</small>}
    </div>
  )
}
