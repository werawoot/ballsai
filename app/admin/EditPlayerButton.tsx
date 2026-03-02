'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Pencil, X, Save } from 'lucide-react'
import { useRouter } from 'next/navigation'

export default function EditPlayerButton({ player }: { player: any }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
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
  const router = useRouter()

  const handleSave = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('player_ranks').update(form).eq('id', player.id)
    setLoading(false)
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
                {[['OVR', 'ovr'], ['PTS', 'pts'], ['PAC', 'pac'], ['SHO', 'sho'], ['PAS', 'pas'], ['DRI', 'dri'], ['DEF', 'def'], ['CHANGE', 'rank_change']].map(([label, key]) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#aaa', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                    <input type="number" value={form[key as keyof typeof form]} onChange={e => setForm({ ...form, [key]: parseInt(e.target.value) || 0 })} style={numInputStyle} />
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleSave} disabled={loading} style={{ width: '100%', marginTop: 20, background: '#CC0001', color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <Save size={18} /> {loading ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
    </>
  )
}