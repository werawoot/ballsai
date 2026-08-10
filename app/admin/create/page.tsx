'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Link2, Save, Trophy } from 'lucide-react'
import Link from 'next/link'

type AthleteAccount = {
  user_id: string
  display_name: string
  current_team?: string | null
  province?: string | null
  position?: string | null
}

export default function CreatePlayerPage() {
  const [form, setForm] = useState({
    player_name: '', team: '', province: '', position: 'FW',
    ovr: 60, pts: 1000, pac: 70, sho: 70, pas: 70, dri: 70, def: 70, rank_change: 0
  })
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState(true)
  const [athleteAccounts, setAthleteAccounts] = useState<AthleteAccount[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [message, setMessage] = useState('')
  const router = useRouter()

  useEffect(() => {
    const loadAthleteAccounts = async () => {
      const supabase = createClient()
      const [{ data: accounts, error: accountsError }, { data: linkedRanks, error: ranksError }] = await Promise.all([
        supabase.from('athlete_profiles').select('user_id, display_name, current_team, province, position').order('display_name'),
        supabase.from('player_ranks').select('player_id').eq('sport', 'football').eq('season', '2026').not('player_id', 'is', null),
      ])
      if (accountsError || ranksError) {
        setMessage(`โหลดบัญชีนักกีฬาไม่สำเร็จ: ${(accountsError || ranksError)?.message}`)
        setLoadingAccounts(false)
        return
      }
      const linkedIds = new Set((linkedRanks ?? []).map(rank => rank.player_id as string))
      setAthleteAccounts(((accounts ?? []) as AthleteAccount[]).filter(account => !linkedIds.has(account.user_id)))
      setLoadingAccounts(false)
    }
    void loadAthleteAccounts()
  }, [])

  const selectAthleteAccount = (playerId: string) => {
    setSelectedPlayerId(playerId)
    const account = athleteAccounts.find(item => item.user_id === playerId)
    if (!account) return
    setForm(current => ({
      ...current,
      player_name: account.display_name,
      team: account.current_team || '',
      province: account.province || '',
      position: account.position || 'FW',
    }))
  }

  const handleSubmit = async () => {
    if (!selectedPlayerId) {
      setMessage('กรุณาเลือก Athlete Account ก่อนสร้าง Ranking')
      return
    }
    if (!form.player_name || !form.team || !form.province) {
      setMessage('กรุณากรอกชื่อ ทีม และจังหวัดให้ครบ')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.from('player_ranks').insert({
      ...form,
      player_id: selectedPlayerId,
      sport: 'football',
      season: '2026'
    })
    if (error) {
      setMessage(error.code === '23505' ? 'บัญชีนี้มี Ranking ใน Season 2026 แล้ว' : `เกิดข้อผิดพลาด: ${error.message}`)
    } else {
      router.push('/admin')
    }
    setLoading(false)
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10,
    padding: '11px 14px', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa'
  }

  const numInputStyle = {
    ...inputStyle, fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 700, textAlign: 'center' as const
  }

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40 }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BallDoenSai.com
        </Link>
        <Link href="/admin" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

      <div style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            เพิ่ม<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>นักกีฬา</span>
          </h1>
        </div>
      </div>

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: 12 }}>

        <div style={{ background: selectedPlayerId ? '#f0fdf4' : 'white', borderRadius: 10, border: `1.5px solid ${selectedPlayerId ? '#15803d' : '#e5e5e5'}`, padding: '18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: selectedPlayerId ? '#166534' : '#CC0001', marginBottom: 10 }}><Link2 size={17} /> เชื่อม Athlete Account</div>
          <select value={selectedPlayerId} onChange={event => selectAthleteAccount(event.target.value)} disabled={loadingAccounts} style={{ ...inputStyle, background: 'white' }}>
            <option value="">{loadingAccounts ? 'กำลังโหลดบัญชี...' : 'เลือกบัญชีนักกีฬา'}</option>
            {athleteAccounts.map(account => <option key={account.user_id} value={account.user_id}>{account.display_name} · {account.current_team || account.province || 'BallDoenSai.com Athlete'}</option>)}
          </select>
          {!loadingAccounts && athleteAccounts.length === 0 && <p style={{ fontSize: 11, color: '#a16207', marginTop: 8 }}>ยังไม่มี Athlete Account ที่ว่าง นักกีฬาต้องสร้างโปรไฟล์ก่อน หรือบัญชีทั้งหมดมี Ranking แล้ว</p>}
          <p style={{ fontSize: 10, color: '#888', lineHeight: 1.5, marginTop: 8 }}>ระบบจะใช้ UUID เชื่อม Profile, Rating และ Match History เข้าด้วยกันอย่างถูกต้อง</p>
        </div>

        <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 16 }}>ข้อมูลทั่วไป</div>
          {[['ชื่อนักกีฬา *', 'player_name'], ['ทีม/สโมสร *', 'team'], ['จังหวัด *', 'province']].map(([label, key]) => (
            <div key={key} style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
              <input value={form[key as keyof typeof form] as string} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
            </div>
          ))}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>ตำแหน่ง</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {['FW', 'MF', 'DF', 'GK'].map(pos => (
                <button key={pos} onClick={() => setForm({ ...form, position: pos })} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid', borderColor: form.position === pos ? '#CC0001' : '#e5e5e5', background: form.position === pos ? '#CC0001' : 'white', color: form.position === pos ? 'white' : '#555', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-barlow)' }}>{pos}</button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 16 }}>Rating V1</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[['OVR', 'ovr'], ['POWER RATING', 'pts'], ['PAC', 'pac'], ['SHO', 'sho'], ['PAS', 'pas'], ['DRI', 'dri'], ['DEF', 'def'], ['LAST CHANGE', 'rank_change']].map(([label, key]) => (
              <div key={key}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 5, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                <input type="number" value={form[key as keyof typeof form] as number} onChange={e => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })} style={numInputStyle} />
              </div>
            ))}
          </div>
        </div>

        {message && <p style={{ textAlign: 'center', fontSize: 13, color: '#CC0001', fontWeight: 600 }}>{message}</p>}

        <button onClick={handleSubmit} disabled={loading || loadingAccounts || !selectedPlayerId} style={{ background: loading || loadingAccounts || !selectedPlayerId ? '#ddd' : '#CC0001', color: loading || loadingAccounts || !selectedPlayerId ? '#888' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading || loadingAccounts || !selectedPlayerId ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: loading || loadingAccounts || !selectedPlayerId ? 'none' : '0 4px 16px rgba(204,0,1,0.3)' }}>
          <Save size={18} /> {loading ? 'กำลังบันทึก...' : 'เพิ่มนักกีฬา'}
        </button>
      </div>
    </main>
  )
}
