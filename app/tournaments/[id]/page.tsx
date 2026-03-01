'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { Trophy, Users, ArrowLeft, CheckCircle, Upload, Copy, Banknote } from 'lucide-react'
import Link from 'next/link'

export default function RegisterPage({ params }: { params: { id: string } }) {
  const [step, setStep] = useState<'form' | 'payment' | 'success'>('form')
  const [teamName, setTeamName] = useState('')
  const [members, setMembers] = useState('')
  const [teamId, setTeamId] = useState('')
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tournament, setTournament] = useState<any>(null)
  const router = useRouter()

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', params.id)
        .single()
      setTournament(data)
    }
    load()
  }, [])

  const handleSubmitTeam = async () => {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const { data, error } = await supabase.from('teams').insert({
      name: teamName,
      members,
      tournament_id: params.id,
      created_by: user.id,
      status: 'pending'
    }).select().single()

    if (error) {
      setMessage('เกิดข้อผิดพลาด: ' + error.message)
    } else {
      setTeamId(data.id)
      setStep('payment')
    }
    setLoading(false)
  }

  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSlipFile(file)
    setSlipPreview(URL.createObjectURL(file))
  }

  const handleUploadSlip = async () => {
    if (!slipFile) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext = slipFile.name.split('.').pop()
    const fileName = `${teamId}_${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('slips')
      .upload(fileName, slipFile)

    if (uploadError) {
      setMessage('อัปโหลดสลิปไม่สำเร็จ: ' + uploadError.message)
      setLoading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('slips').getPublicUrl(fileName)

    const { error: paymentError } = await supabase.from('payments').insert({
      team_id: teamId,
      tournament_id: params.id,
      user_id: user.id,
      amount: tournament?.fee ?? 0,
      promptpay: tournament?.promptpay ?? '',
      slip_url: urlData.publicUrl,
      status: 'pending'
    })

    if (paymentError) {
      setMessage('บันทึกการชำระเงินไม่สำเร็จ: ' + paymentError.message)
    } else {
      setStep('success')
    }
    setLoading(false)
  }

  const copyPromptPay = () => {
    if (tournament?.promptpay) {
      navigator.clipboard.writeText(tournament.promptpay)
    }
  }

  if (step === 'success') {
    return (
      <main style={{ minHeight: '100vh', background: '#f8f8f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <CheckCircle size={72} color="#16a34a" strokeWidth={1.5} style={{ marginBottom: 20 }} />
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 26, fontWeight: 700, color: '#111', marginBottom: 8, textAlign: 'center' }}>สมัครสำเร็จ!</div>
        <p style={{ fontSize: 14, color: '#888', textAlign: 'center', marginBottom: 24 }}>ส่งสลิปเรียบร้อยแล้ว รอ Organizer ยืนยันครับ</p>
        <Link href="/tournaments" style={{ background: '#CC0001', color: 'white', borderRadius: 12, padding: '13px 32px', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-oswald)', textDecoration: 'none' }}>
          กลับหน้ารายการแข่ง
        </Link>
      </main>
    )
  }

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', overflowX: 'hidden', paddingBottom: 40 }}>

      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={16} /> กลับ
        </button>
      </header>

      {/* STEP INDICATOR */}
      <div style={{ background: '#CC0001', padding: '0 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {['ข้อมูลทีม', 'ชำระเงิน'].map((label, i) => {
            const isActive = (i === 0 && step === 'form') || (i === 1 && step === 'payment')
            const isDone = i === 0 && step === 'payment'
            return (
              <div key={i} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? '#16a34a' : isActive ? 'white' : 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, color: isDone ? 'white' : isActive ? '#CC0001' : 'rgba(255,255,255,0.7)' }}>
                    {isDone ? '✓' : i + 1}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: isActive ? 'white' : 'rgba(255,255,255,0.6)' }}>{label}</span>
                </div>
                {i < 1 && <div style={{ flex: 1, height: 2, background: step === 'payment' ? '#16a34a' : 'rgba(255,255,255,0.3)', margin: '0 8px', marginBottom: 18 }} />}
              </div>
            )
          })}
        </div>
      </div>

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: '16px' }}>

        {step === 'form' && (
          <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Trophy size={16} /> ข้อมูลทีม
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>ชื่อทีม *</label>
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <Trophy size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#aaa' }} />
              <input type="text" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="เช่น FC อยุธยา" style={{ width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '11px 14px 11px 40px', fontSize: 14, outline: 'none', fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa' }} />
            </div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, letterSpacing: 0.5, textTransform: 'uppercase' }}>รายชื่อสมาชิก *</label>
            <div style={{ position: 'relative', marginBottom: 24 }}>
              <Users size={16} style={{ position: 'absolute', left: 14, top: 14, color: '#aaa' }} />
              <textarea value={members} onChange={e => setMembers(e.target.value)} placeholder="เช่น สมชาย, สมหญิง, สมศักดิ์" rows={4} style={{ width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '11px 14px 11px 40px', fontSize: 14, outline: 'none', fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa', resize: 'none' }} />
            </div>
            {message && <p style={{ textAlign: 'center', fontSize: 13, color: '#CC0001', fontWeight: 600, marginBottom: 14 }}>{message}</p>}
            <button onClick={handleSubmitTeam} disabled={loading || !teamName || !members} style={{ width: '100%', background: loading || !teamName || !members ? '#eee' : '#CC0001', color: loading || !teamName || !members ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading || !teamName || !members ? 'default' : 'pointer' }}>
              {loading ? 'กำลังบันทึก...' : 'ถัดไป → ชำระเงิน'}
            </button>
          </div>
        )}

        {step === 'payment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Banknote size={16} /> ชำระเงิน
              </div>
              <div style={{ background: '#f8f8f8', borderRadius: 12, padding: '16px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#888', marginBottom: 4, textTransform: 'uppercase' }}>ยอดชำระ</div>
                <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 36, fontWeight: 800, color: '#CC0001' }}>฿{tournament?.fee?.toLocaleString()}</div>
              </div>
              {tournament?.promptpay && (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8, textTransform: 'uppercase' }}>เบอร์ PromptPay</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f8f8f8', borderRadius: 10, padding: '12px 14px', border: '1.5px solid #e5e5e5' }}>
                    <span style={{ flex: 1, fontFamily: 'var(--font-oswald)', fontSize: 20, fontWeight: 700, color: '#111', letterSpacing: 1 }}>{tournament.promptpay}</span>
                    <button onClick={copyPromptPay} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#CC0001', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <Copy size={13} /> คัดลอก
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Upload size={16} /> อัปโหลดสลิป
              </div>
              <label style={{ display: 'block', cursor: 'pointer' }}>
                <input type="file" accept="image/*" onChange={handleSlipChange} style={{ display: 'none' }} />
                {slipPreview ? (
                  <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '2px solid #CC0001' }}>
                    <img src={slipPreview} alt="slip" style={{ width: '100%', maxHeight: 300, objectFit: 'contain', display: 'block' }} />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'rgba(204,0,1,0.8)', color: 'white', textAlign: 'center', padding: '8px', fontSize: 12, fontWeight: 700 }}>
                      แตะเพื่อเปลี่ยนสลิป
                    </div>
                  </div>
                ) : (
                  <div style={{ border: '2px dashed #e5e5e5', borderRadius: 12, padding: '40px 20px', textAlign: 'center', background: '#fafafa' }}>
                    <Upload size={32} color="#ccc" strokeWidth={1.5} style={{ marginBottom: 10 }} />
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#aaa', marginBottom: 4 }}>แตะเพื่อเลือกสลิป</p>
                    <p style={{ fontSize: 12, color: '#ccc' }}>รองรับ JPG, PNG</p>
                  </div>
                )}
              </label>
            </div>

            {message && <p style={{ textAlign: 'center', fontSize: 13, color: '#CC0001', fontWeight: 600 }}>{message}</p>}

            <button onClick={handleUploadSlip} disabled={loading || !slipFile} style={{ width: '100%', background: loading || !slipFile ? '#eee' : '#CC0001', color: loading || !slipFile ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading || !slipFile ? 'default' : 'pointer' }}>
              {loading ? 'กำลังส่ง...' : 'ยืนยันการชำระเงิน'}
            </button>
          </div>
        )}

      </div>
    </main>
  )
}