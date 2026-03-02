'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function DeletePlayerButton({ playerId }: { playerId: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const handleDelete = async () => {
    if (!confirm('ลบนักกีฬานี้?')) return
    setLoading(true)
    const supabase = createClient()
    await supabase.from('player_ranks').delete().eq('id', playerId)
    setLoading(false)
    router.refresh()
  }

  return (
    <button onClick={handleDelete} disabled={loading} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, border: '1.5px solid #e5e5e5', background: 'white', color: '#CC0001', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-oswald)' }}>
      <Trash2 size={15} /> {loading ? '...' : 'ลบ'}
    </button>
  )
}