'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { History, Loader2, Undo2 } from 'lucide-react'

type MatchResultRow = {
  id: string
  tournament_id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  status: string
  created_at: string
}

export default function MatchResultHistory({
  matchResults,
  teamNames,
  tournamentNames,
}: {
  matchResults: MatchResultRow[]
  teamNames: Record<string, string>
  tournamentNames: Record<string, string>
}) {
  const router = useRouter()
  const [voidingId, setVoidingId] = useState('')
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const voidResult = async (result: MatchResultRow) => {
    const teamA = teamNames[result.team_a_id] ?? 'Team A'
    const teamB = teamNames[result.team_b_id] ?? 'Team B'
    const confirmed = window.confirm(
      `ยกเลิกผล ${teamA} ${result.team_a_score} - ${result.team_b_score} ${teamB}?\n\n` +
      'Power Rating, XP และ Badge ที่ได้จากนัดนี้จะถูกคืนค่ากลับ และผลนัดนี้จะถูกทำเครื่องหมายว่ายกเลิก'
    )
    if (!confirmed) return

    setVoidingId(result.id)
    setMessage(null)
    const response = await fetch(`/api/match-results/${result.id}/void`, { method: 'POST' })
    const payload = await response.json().catch(() => null) as { error?: string; revertedPerformances?: number } | null
    setVoidingId('')

    if (!response.ok) {
      setMessage({ kind: 'error', text: payload?.error ?? 'ยกเลิกผลแข่งไม่สำเร็จ' })
      return
    }

    setMessage({ kind: 'success', text: `ยกเลิกผลแข่งแล้ว · คืนค่านักกีฬา ${payload?.revertedPerformances ?? 0} คน` })
    router.refresh()
  }

  if (matchResults.length === 0) {
    return (
      <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 8 }}>
          <History size={17} /> ผลที่บันทึกไปแล้ว
        </div>
        <p style={{ fontSize: 12, color: '#888', margin: 0 }}>ยังไม่มีผลแข่งที่บันทึกในรายการของคุณ</p>
      </div>
    )
  }

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 12 }}>
        <History size={17} /> ผลที่บันทึกไปแล้ว
      </div>

      {message && (
        <div style={{ background: message.kind === 'success' ? '#dcfce7' : '#fee2e2', color: message.kind === 'success' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 12px', fontSize: 12, fontWeight: 700, lineHeight: 1.6, marginBottom: 12 }}>
          {message.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {matchResults.map(result => {
          const isVoid = result.status === 'void'
          return (
            <div key={result.id} style={{ border: '1.5px solid #eee', borderRadius: 12, padding: 12, background: isVoid ? '#fafafa' : 'white', opacity: isVoid ? 0.7 : 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#111', textDecoration: isVoid ? 'line-through' : 'none' }}>
                    {teamNames[result.team_a_id] ?? 'Team A'} {result.team_a_score} - {result.team_b_score} {teamNames[result.team_b_id] ?? 'Team B'}
                  </div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 3 }}>
                    {tournamentNames[result.tournament_id] ?? 'รายการแข่งขัน'} · {new Date(result.created_at).toLocaleDateString('th-TH')}
                  </div>
                </div>
                {isVoid ? (
                  <span style={{ flex: '0 0 auto', background: '#f3f4f6', color: '#6b7280', borderRadius: 20, padding: '5px 11px', fontSize: 11, fontWeight: 800 }}>ยกเลิกแล้ว</span>
                ) : (
                  <button
                    onClick={() => voidResult(result)}
                    disabled={Boolean(voidingId)}
                    style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 5, background: 'white', color: '#CC0001', border: '1.5px solid #f2d0d0', borderRadius: 20, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: voidingId ? 'default' : 'pointer' }}
                  >
                    {voidingId === result.id ? <Loader2 size={13} /> : <Undo2 size={13} />}
                    {voidingId === result.id ? 'กำลังยกเลิก...' : 'ยกเลิกผล'}
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <p style={{ fontSize: 11, color: '#a16207', lineHeight: 1.6, marginTop: 12, marginBottom: 0 }}>
        ยกเลิกได้เฉพาะผลที่ยังเป็นนัดล่าสุดของนักกีฬาทุกคนในนัดนั้น ถ้ามีนัดใหม่กว่าบันทึกทับไปแล้ว ต้องยกเลิกนัดล่าสุดก่อน
      </p>
    </div>
  )
}
