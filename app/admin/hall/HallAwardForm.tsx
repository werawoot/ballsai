'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Award, Save } from 'lucide-react'
import { createClient } from '@/lib/supabase'

type Player = { id: string; player_id: string | null; player_name: string; team: string; province: string; position: string }

export default function HallAwardForm({ players }: { players: Player[] }) {
  const router = useRouter()
  const [playerId, setPlayerId] = useState('')
  const [category, setCategory] = useState('mvp')
  const [ageGroup, setAgeGroup] = useState('OPEN')
  const [season, setSeason] = useState('2026')
  const [citation, setCitation] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const player = players.find(item => item.id === playerId)

  const publish = async () => {
    if (!player || !citation.trim()) { setMessage('เลือกนักกีฬาและเขียนคำเชิดชูผลงานก่อน'); return }
    setLoading(true); setMessage('')
    const { error } = await createClient().from('hall_of_fame_entries').insert({
      season, category, age_group: ageGroup, province: player.province || null,
      athlete_id: player.player_id, player_rank_id: player.id, athlete_name: player.player_name,
      team_name: player.team || null, position: player.position || null, citation: citation.trim(),
    })
    setLoading(false)
    if (error) { setMessage(error.code === '23505' ? 'นักกีฬาคนนี้มีรางวัลหมวดนี้ในฤดูกาล/รุ่นอายุนี้แล้ว' : `เผยแพร่ไม่สำเร็จ: ${error.message}`); return }
    setMessage('ประกาศเกียรติยศใน Hall of Fame แล้ว')
    setCitation(''); router.refresh()
  }

  const input = { width: '100%', border: '1px solid #ded8cd', background: '#fff', padding: '10px 11px', fontSize: 13, fontFamily: 'var(--font-sarabun)' } as const
  return <section style={{ background: 'white', border: '1px solid #ded8cd', maxWidth: 680, padding: 20 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c91c24', fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 800 }}><Award size={20} /> ประกาศ Hall of Fame</div>
    <p style={{ color: '#777', fontSize: 12, lineHeight: 1.55, margin: '7px 0 18px' }}>รายการนี้เป็นเกียรติยศถาวร ไม่เปลี่ยนตาม Live Ranking</p>
    <div style={{ display: 'grid', gap: 12 }}>
      <select value={playerId} onChange={event => setPlayerId(event.target.value)} style={input}><option value="">เลือกนักกีฬาจาก Ranking</option>{players.map(item => <option key={item.id} value={item.id}>{item.player_name} · {item.team} · {item.province}</option>)}</select>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <select value={category} onChange={event => setCategory(event.target.value)} style={input}>{[['champion','CHAMPION'],['mvp','MVP'],['golden_boot','GOLDEN BOOT'],['province_leader','PROVINCE LEADER'],['rising_star','RISING STAR'],['fair_play','FAIR PLAY']].map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={ageGroup} onChange={event => setAgeGroup(event.target.value)} style={input}>{['U12','U15','U18','OPEN'].map(item => <option key={item}>{item}</option>)}</select>
        <input value={season} onChange={event => setSeason(event.target.value.slice(0, 12))} placeholder="Season" style={input} />
      </div>
      <textarea value={citation} onChange={event => setCitation(event.target.value.slice(0, 280))} rows={4} placeholder="คำเชิดชูผลงาน เช่น MVP จากฟอร์มที่โดดเด่นตลอดการแข่งขัน" style={{ ...input, resize: 'vertical' }} />
    </div>
    {message && <p style={{ color: message.startsWith('ประกาศ') ? '#15803d' : '#c91c24', fontSize: 12, fontWeight: 700, marginTop: 12 }}>{message}</p>}
    <button type="button" disabled={loading} onClick={publish} style={{ alignItems: 'center', background: loading ? '#aaa' : '#c91c24', border: 0, color: 'white', cursor: loading ? 'wait' : 'pointer', display: 'flex', fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 800, gap: 7, justifyContent: 'center', marginTop: 16, minHeight: 44, width: '100%' }}><Save size={17} />{loading ? 'กำลังประกาศ…' : 'ประกาศสู่ HALL OF FAME'}</button>
  </section>
}
