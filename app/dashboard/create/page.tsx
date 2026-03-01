'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Trophy, MapPin, Calendar, Banknote, ArrowLeft, FileText, Phone, CheckCircle } from 'lucide-react'
import Link from 'next/link'

export default function CreateTournamentPage() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [fee, setFee] = useState('')
  const [promptpay, setPromptpay] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()

  const handleSubmit = async () => {
    if (!name || !location || !startDate || !fee) {
      setMessage('กรุณากรอกข้อมูลที่จำเป็นให้ครบ')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { error } = await supabase.from('tournaments').insert({
      name,
      description,
      location,
      start_date: startDate,
      end_date: endDate || startDate,
      fee: parseFloat(fee),
      promptpay,
      organizer_id: user.id,
      status: 'open'
    })

    if (error) {
      setMessage('เกิดข้อผิดพลาด: ' + error.message)
    } else {
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 2000)
    }
    setLoading(false)
  }

  if (success) {
    return (
      <main style={{ minHeight: '100vh', background: '#f8f8f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <CheckCircle size={64} color="#16a34a" strokeWidth={1.5} style={{ marginBottom: 16 }} />
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>สร้างรายการสำเร็จ!</div>
          <p style={{ fontSize: 14, color: '#888' }}>กำลังกลับไปหน้า Dashboard...</p>
        </div>
      </main>
    )
  }

  const inputStyle = {
    width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10,
    padding: '11px 14px 11px 40px', fontSize: 14, outline: 'none',
    fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa'
  }

  const Field = ({ icon, label, value, onChange, placeholder, type = 'text', required = false }: any) => (
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

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', overflowX: 'hidden', paddingBottom: 40 }}>

      {/* TOPBAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

      {/* HERO */}
      <div style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            สร้าง<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>รายการแข่ง</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>กรอกข้อมูลรายการแข่งขันของคุณ</p>
        </div>
      </div>

      {/* Wave */}
      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      {/* FORM */}
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

        <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Banknote size={16} /> ค่าสมัครและการชำระเงิน
          </div>
          <Field icon={<Banknote size={16} />} label="ค่าสมัคร (บาท)" value={fee} onChange={setFee} placeholder="500" type="number" required />
          <Field icon={<Phone size={16} />} label="เบอร์ PromptPay" value={promptpay} onChange={setPromptpay} placeholder="08x-xxx-xxxx" type="tel" />
        </div>

        {message && (
          <p style={{ textAlign: 'center', fontSize: 13, color: '#CC0001', fontWeight: 600, marginBottom: 14 }}>{message}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ width: '100%', background: loading ? '#eee' : '#CC0001', color: loading ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading ? 'default' : 'pointer', boxShadow: loading ? 'none' : '0 4px 16px rgba(204,0,1,0.3)', transition: 'all 0.2s' }}
        >
          {loading ? 'กำลังสร้าง...' : 'สร้างรายการแข่งขัน'}
        </button>
      </div>

    </main>
  )
}