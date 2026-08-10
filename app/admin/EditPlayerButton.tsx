'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Link2, Pencil, Save, X } from 'lucide-react'
import { useRouter } from 'next/navigation'

type PlayerRecord = {
  id: string
  player_id?: string | null
  player_name: string
  team: string
  province: string
  position: string
  ovr: number
  pts: number
  pac: number
  sho: number
  pas: number
  dri: number
  def: number
  rank_change: number
}

type AthleteAccount = {
  user_id: string
  display_name: string
  current_team?: string | null
  province?: string | null
  position?: string | null
}

export default function EditPlayerButton({
  player,
  athleteAccounts,
  linkedPlayerIds,
}: {
  player: PlayerRecord
  athleteAccounts: AthleteAccount[]
  linkedPlayerIds: string[]
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    player_id: player.player_id ?? '',
    player_name: player.player_name,
    team: player.team,
    province: player.province,
    position: player.position,
    ovr: player.ovr,
    pts: player.pts,
    pac: player.pac,
    sho: player.sho,
    pas: player.pas,
    dri: player.dri,
    def: player.def,
    rank_change: player.rank_change,
  })
  const [message, setMessage] = useState('')
  const router = useRouter()
  const availableAccounts = athleteAccounts.filter(account =>
    account.user_id === player.player_id || !linkedPlayerIds.includes(account.user_id)
  )

  const selectAthleteAccount = (playerId: string) => {
    const account = athleteAccounts.find(item => item.user_id === playerId)
    setForm(current => ({
      ...current,
      player_id: playerId,
      ...(account ? {
        player_name: account.display_name || current.player_name,
        team: account.current_team || current.team,
        province: account.province || current.province,
        position: account.position || current.position,
      } : {}),
    }))
  }

  const handleSave = async () => {
    setLoading(true)
    setMessage('')
    const supabase = createClient()
    const { error } = await supabase.from('player_ranks').update({
      ...form,
      player_id: form.player_id || null,
    }).eq('id', player.id)
    setLoading(false)
    if (error) {
      setMessage(error.code === '23505' ? 'บัญชีนี้มี Ranking ใน Season 2026 แล้ว' : `บันทึกไม่สำเร็จ: ${error.message}`)
      return
    }
    setOpen(false)
    router.refresh()
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 8,
    padding: '8px 12px', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa'
  }

  const numInputStyle = {
    ...inputStyle, fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, textAlign: 'center' as const
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px', borderRadius: 10, border: 'none', background: '#CC0001', color: 'white', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-oswald)' }}>
        <Pencil size={15} /> แก้ไข
      </button>

      {open && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div style={{ background: 'white', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 700, color: '#111' }}>แก้ไขนักกีฬา</div>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#aaa' }}><X size={22} /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, border: `1.5px solid ${form.player_id ? '#15803d' : '#e5e5e5'}`, borderRadius: 8, background: form.player_id ? '#f0fdf4' : '#fafafa' }}>
                <label htmlFor={`athlete-account-${player.id}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 800, color: '#555', marginBottom: 7 }}><Link2 size={14} /> ATHLETE ACCOUNT</label>
                <select id={`athlete-account-${player.id}`} value={form.player_id} onChange={event => selectAthleteAccount(event.target.value)} style={{ ...inputStyle, padding: '9px 10px', background: 'white' }}>
                  <option value="">ยังไม่เชื่อมบัญชี</option>
                  {availableAccounts.map(account => <option key={account.user_id} value={account.user_id}>{account.display_name} · {account.current_team || account.province || 'BallDoenSai.com Athlete'}</option>)}
                </select>
                <p style={{ fontSize: 10, color: '#888', lineHeight: 1.5, marginTop: 7 }}>เลือกจากบัญชีที่สร้าง Athlete Profile แล้ว ระบบจะใช้ UUID เชื่อมข้อมูลแทนชื่อ</p>
              </div>

              {[['ชื่อนักกีฬา', 'player_name'], ['ทีม', 'team'], ['จังหวัด', 'province']].map(([label, key]) => (
                <div key={key}>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                  <input value={form[key as keyof typeof form]} onChange={e => setForm({ ...form, [key]: e.target.value })} style={inputStyle} />
                </div>
              ))}

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>ตำแหน่ง</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {['FW', 'MF', 'DF', 'GK'].map(pos => (
                    <button key={pos} onClick={() => setForm({ ...form, position: pos })} style={{ flex: 1, padding: '8px', borderRadius: 8, border: '1.5px solid', borderColor: form.position === pos ? '#CC0001' : '#e5e5e5', background: form.position === pos ? '#CC0001' : 'white', color: form.position === pos ? 'white' : '#555', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-barlow)' }}>{pos}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[['OVR', 'ovr'], ['POWER', 'pts'], ['PAC', 'pac'], ['SHO', 'sho'], ['PAS', 'pas'], ['DRI', 'dri'], ['DEF', 'def'], ['CHANGE', 'rank_change']].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                    <input type="number" value={form[key as keyof typeof form]} onChange={e => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })} style={numInputStyle} />
                  </div>
                ))}
              </div>
            </div>

            {message && <div role="alert" style={{ marginTop: 12, padding: '9px 11px', borderRadius: 7, background: '#fff1f1', color: '#a40000', fontSize: 12, fontWeight: 700 }}>{message}</div>}

            <button onClick={handleSave} disabled={loading} style={{ width: '100%', marginTop: 20, background: '#CC0001', color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Save size={18} /> {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
