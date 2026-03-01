'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { CheckCircle, XCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function ConfirmTeamButton({ teamId, action }: { teamId: string, action: 'confirmed' | 'rejected' }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleClick = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('teams').update({ status: action }).eq('id', teamId)
    setLoading(false)
    router.refresh()
  }

  const isConfirm = action === 'confirmed'

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '10px', borderRadius: 10, border: 'none', cursor: loading ? 'default' : 'pointer',
        background: isConfirm ? '#CC0001' : '#f8f8f8',
        color: isConfirm ? 'white' : '#888',
        fontSize: 13, fontWeight: 800,
        fontFamily: 'var(--font-oswald)', letterSpacing: 0.5,
        opacity: loading ? 0.6 : 1
      }}
    >
      {isConfirm ? <CheckCircle size={16} /> : <XCircle size={16} />}
      {loading ? '...' : isConfirm ? 'ยืนยัน' : 'ปฏิเสธ'}
    </button>
  )
}