'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, Calendar, FileText, MapPin, Phone, Save, Trophy, Users } from 'lucide-react'

type TournamentRecord = {
  id: string
  name: string
  description: string | null
  location: string
  start_date: string
  end_date: string | null
  fee: number
  promptpay: string | null
  max_teams: number | null
  status: string
}

type FieldProps = {
  icon: ReactNode
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  type?: string
  required?: boolean
}

const inputStyle = {
  width: '100%',
  border: '1.5px solid #e5e5e5',
  borderRadius: 10,
  padding: '11px 14px 11px 40px',
  fontSize: 14,
  outline: 'none',
  fontFamily: 'var(--font-sarabun)',
  color: '#111',
  background: '#fafafa',
} as const

function Field({ icon, label, value, onChange, placeholder, type = 'text', required = false }: FieldProps) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
        {label} {required && <span style={{ color: '#CC0001' }}>*</span>}
      </label>
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }}>{icon}</div>
        <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      </div>
    </div>
  )
}

export default function EditTournamentForm({ tournament }: { tournament: TournamentRecord }) {
  const [name, setName] = useState(tournament.name)
  const [description, setDescription] = useState(tournament.description ?? '')
  const [location, setLocation] = useState(tournament.location)
  const [startDate, setStartDate] = useState(tournament.start_date)
  const [endDate, setEndDate] = useState(tournament.end_date ?? '')
  const [fee, setFee] = useState(String(tournament.fee ?? 0))
  const [promptpay, setPromptpay] = useState(tournament.promptpay ?? '')
  const [maxTeams, setMaxTeams] = useState(String(tournament.max_teams ?? 16))
  const [status, setStatus] = useState(tournament.status === 'closed' ? 'closed' : 'open')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [success, setSuccess] = useState(false)
  const router = useRouter()

  const handleSubmit = async () => {
    if (!name || !location || !startDate || !fee) {
      setMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
      return
    }

    setLoading(true)
    setMessage('')
    setSuccess(false)

    const response = await fetch(`/api/tournaments/${tournament.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        description,
        location,
        startDate,
        endDate,
        fee: Number(fee),
        promptpay,
        maxTeams: Number(maxTeams) || 16,
        status,
      }),
    })

    if (response.status === 401) {
      setLoading(false)
      router.push('/login')
      return
    }

    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setMessage(data?.error ?? 'บันทึกรายการไม่สำเร็จ')
    } else {
      setSuccess(true)
      setMessage('บันทึกรายการสำเร็จ')
      router.refresh()
    }

    setLoading(false)
  }

  return (
    <div style={{ padding: '16px' }}>
      <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Trophy size={16} /> ข้อมูลรายการ
        </div>
        <Field icon={<Trophy size={16} />} label="ชื่อรายการ" value={name} onChange={setName} placeholder="เช่น อยุธยา คัพ 2026" required />
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            รายละเอียด
          </label>
          <div style={{ position: 'relative' }}>
            <FileText size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#aaa' }} />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="รายละเอียดของรายการแข่งขัน" rows={3} style={{ width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '11px 14px 11px 40px', fontSize: 14, outline: 'none', fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa', resize: 'none' }} />
          </div>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <MapPin size={16} /> สถานที่และวันเวลา
        </div>
        <Field icon={<MapPin size={16} />} label="สถานที่" value={location} onChange={setLocation} placeholder="เช่น สนามกีฬาอยุธยา" required />
        <Field icon={<Calendar size={16} />} label="วันที่แข่ง" value={startDate} onChange={setStartDate} placeholder="" type="date" required />
        <Field icon={<Calendar size={16} />} label="วันสิ้นสุด (ถ้ามี)" value={endDate} onChange={setEndDate} placeholder="" type="date" />
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 12 }}>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Banknote size={16} /> ค่าสมัครและการชำระเงิน
        </div>
        <Field icon={<Banknote size={16} />} label="ค่าสมัคร (บาท)" value={fee} onChange={setFee} placeholder="500" type="number" required />
        <Field icon={<Phone size={16} />} label="เบอร์ PromptPay" value={promptpay} onChange={setPromptpay} placeholder="08x-xxx-xxxx" type="tel" />
        <Field icon={<Users size={16} />} label="จำนวนทีมสูงสุด" value={maxTeams} onChange={setMaxTeams} placeholder="16" type="number" required />
      </div>

      <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 }}>
          สถานะรับสมัคร
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { value: 'open', label: 'เปิดรับสมัคร' },
            { value: 'closed', label: 'ปิดรับสมัคร' },
          ].map(option => (
            <button key={option.value} onClick={() => setStatus(option.value)} style={{ padding: '12px 10px', borderRadius: 12, border: '1.5px solid', borderColor: status === option.value ? '#CC0001' : '#e5e5e5', background: status === option.value ? '#CC0001' : 'white', color: status === option.value ? 'white' : '#555', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-sarabun)' }}>
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {message && (
        <p style={{ textAlign: 'center', fontSize: 13, color: success ? '#16a34a' : '#CC0001', fontWeight: 700, marginBottom: 14 }}>{message}</p>
      )}

      <button
        onClick={handleSubmit}
        disabled={loading}
        style={{ width: '100%', background: loading ? '#eee' : '#CC0001', color: loading ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading ? 'default' : 'pointer', boxShadow: loading ? 'none' : '0 4px 16px rgba(204,0,1,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
      >
        <Save size={18} /> {loading ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
      </button>
    </div>
  )
}
