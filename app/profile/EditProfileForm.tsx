'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { User, MapPin, Users, Phone, Save } from 'lucide-react'

export default function EditProfileForm({ profile, userId }: { profile: any, userId: string }) {
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [province, setProvince] = useState(profile?.province ?? '')
  const [team, setTeam] = useState(profile?.team ?? '')
  const [position, setPosition] = useState(profile?.position ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    const supabase = createClient()
    await supabase.from('profiles').upsert({
      id: userId,
      full_name: fullName,
      province,
      team,
      position,
      phone,
    })
    setLoading(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10,
    padding: '11px 14px 11px 40px', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa'
  }

  const Field = ({ icon, label, value, onChange, placeholder, type = 'text' }: any) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}>{icon}</div>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      </div>
    </div>
  )

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <Field icon={<User size={16} />} label="ชื่อ-นามสกุล" value={fullName} onChange={setFullName} placeholder="สมศักดิ์ วีรชัย" />
      <Field icon={<MapPin size={16} />} label="จังหวัด" value={province} onChange={setProvince} placeholder="กรุงเทพฯ" />
      <Field icon={<Users size={16} />} label="ทีม/สโมสร" value={team} onChange={setTeam} placeholder="Bangkok FC" />
      <Field icon={<Phone size={16} />} label="เบอร์โทร" value={phone} onChange={setPhone} placeholder="08x-xxx-xxxx" type="tel" />

      <div style={{ marginBottom: 20 }}>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>ตำแหน่ง</label>
        <div style={{ display: 'flex', gap: 8 }}>
          {['FW', 'MF', 'DF', 'GK'].map(pos => (
            <button key={pos} onClick={() => setPosition(pos)} style={{
              flex: 1, padding: '10px', borderRadius: 10, border: '1.5px solid',
              borderColor: position === pos ? '#CC0001' : '#e5e5e5',
              background: position === pos ? '#CC0001' : 'white',
              color: position === pos ? 'white' : '#555',
              fontSize: 13, fontWeight: 800, cursor: 'pointer',
              fontFamily: 'var(--font-barlow)', letterSpacing: 0.5
            }}>{pos}</button>
          ))}
        </div>
      </div>

      <button
        onClick={handleSave}
        disabled={loading}
        style={{ width: '100%', background: saved ? '#16a34a' : '#CC0001', color: 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, transition: 'background 0.3s' }}
      >
        <Save size={18} />
        {loading ? 'กำลังบันทึก...' : saved ? 'บันทึกแล้ว ✓' : 'บันทึกข้อมูล'}
      </button>
    </div>
  )
}