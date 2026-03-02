'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useParams } from 'next/navigation'
import { Trophy, Users, CreditCard, CheckCircle, Copy, Upload, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default function RegisterPage() {
  const [step, setStep] = useState(1)
  const [tournament, setTournament] = useState<any>(null)
  const [teamName, setTeamName] = useState('')
  const [members, setMembers] = useState('')
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [teamId, setTeamId] = useState('')
  const [isFull, setIsFull] = useState(false)
  const router = useRouter()
  const params = useParams()

  useEffect(() => {
    const load = async () => {
      const supabase = createClient()
      const { data: t } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', params.id)
        .single()
      setTournament(t)

      // เช็คว่าทีมเต็มไหม
      if (t?.max_teams) {
        const { count } = await supabase
          .from('teams')
          .select('*', { count: 'exact', head: true })
          .eq('tournament_id', params.id)
        if (count !== null && count >= t.max_teams) {
          setIsFull(true)
        }
      }
    }
    load()
  }, [])

  const handleStep1 = async () => {
    if (!teamName || !members) return
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

    if (!error && data) {
      setTeamId(data.id)
      setStep(2)
    }
    setLoading(false)
  }

  const handleStep2 = async () => {
    if (!slipFile) return
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    const fileName = `${user?.id}_${Date.now()}.${slipFile.name.split('.').pop()}`
    const { data: uploadData } = await supabase.storage.from('slips').upload(fileName, slipFile)

    if (uploadData) {
      const { data: urlData } = supabase.storage.from('slips').getPublicUrl(fileName)
      await supabase.from('payments').insert({
        team_id: teamId,
        tournament_id: params.id,
        user_id: user?.id,
        amount: tournament?.fee,
        promptpay: tournament?.promptpay,
        slip_url: urlData.publicUrl,
        status: 'pending'
      })
      setStep(3)
    }
    setLoading(false)
  }

  if (!tournament) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Loading...</div>

  if (isFull) return (
    <main style={{ minHeight: '100vh', background: '#f8f8f8', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center' }}>
        <Users size={64} color="#CC0001" strokeWidth={1.5} style={{ marginBottom: 16 }} />
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 700, color: '#111', marginBottom: 8 }}>ทีมเต็มแล้วครับ!</div>
        <p style={{ fontSize: 14, color: '#888', marginBottom: 20 }}>รายการ {tournament.name} รับทีมครบ {tournament.max_teams} ทีมแล้ว</p>
        <Link href="/tournaments" style={{ background: '#CC0001', color: 'white', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 800, textDecoration: 'none', fontFamily: 'var(--font-oswald)' }}>
          ดูรายการอื่น
        </Link>
      </div>
    </main>
  )

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 40, overflowX: 'hidden' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <Link href={`/tournaments/${params.id}`} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

      <div style={{ background: '#CC0001', padding: '20px 16px 36px' }}>
        <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 28, fontWeight: 700, color: 'white', marginBottom: 4 }}>สมัครทีม</h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>{tournament.name}</p>
        <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
          {[1, 2, 3].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: step >= s ? 'white' : 'rgba(255,255,255,0.3)' }} />
          ))}
        </div>
      </div>

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: '16px' }}>

        {step === 1 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <Users size={20} color="#CC0001" />
              <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, textTransform: 'uppercase' }}>ข้อมูลทีม</span>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, textTransform: 'uppercase' }}>ชื่อทีม *</label>
              <input value={teamName} onChange={e => setTeamName(e.target.value)} placeholder="เช่น สิงห์อยุธยา FC" style={{ width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none' }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 6, textTransform: 'uppercase' }}>รายชื่อผู้เล่น *</label>
              <textarea value={members} onChange={e => setMembers(e.target.value)} placeholder="กรอกชื่อผู้เล่น คั่นด้วยจุลภาค เช่น สมชาย, สมหญิง, สมศรี" rows={4} style={{ width: '100%', border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '11px 14px', fontSize: 14, outline: 'none', resize: 'none' }} />
            </div>
            <button onClick={handleStep1} disabled={loading || !teamName || !members} style={{ width: '100%', background: loading || !teamName || !members ? '#eee' : '#CC0001', color: loading || !teamName || !members ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-oswald)', cursor: 'pointer' }}>
              {loading ? 'กำลังบันทึก...' : 'ถัดไป →'}
            </button>
          </div>
        )}

        {step === 2 && (
          <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
              <CreditCard size={20} color="#CC0001" />
              <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, textTransform: 'uppercase' }}>ชำระเงิน</span>
            </div>
            <div style={{ background: '#f8f8f8', borderRadius: 12, padding: '16px', marginBottom: 16, textAlign: 'center' }}>
              <p style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>PromptPay</p>
              <p style={{ fontFamily: 'var(--font-oswald)', fontSize: 22, fontWeight: 700, color: '#111', marginBottom: 8 }}>{tournament.promptpay}</p>
              <p style={{ fontFamily: 'var(--font-oswald)', fontSize: 28, fontWeight: 800, color: '#CC0001' }}>฿{tournament.fee}</p>
              <button onClick={() => navigator.clipboard.writeText(tournament.promptpay)} style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', gap: 4, background: 'white', border: '1.5px solid #e5e5e5', borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                <Copy size={13} /> Copy เบอร์
              </button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 8, textTransform: 'uppercase' }}>อัปโหลดสลิป *</label>
              <input type="file" accept="image/*" onChange={e => { const f = e.target.files?.[0]; if (f) { setSlipFile(f); setSlipPreview(URL.createObjectURL(f)) } }} style={{ display: 'none' }} id="slip-upload" />
              <label htmlFor="slip-upload" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, border: '2px dashed #e5e5e5', borderRadius: 12, padding: '24px', cursor: 'pointer', background: slipPreview ? '#f0fdf4' : '#fafafa' }}>
                {slipPreview ? <img src={slipPreview} style={{ maxHeight: 200, borderRadius: 8 }} /> : <><Upload size={24} color="#aaa" /><span style={{ fontSize: 13, color: '#aaa' }}>แตะเพื่อเลือกรูปสลิป</span></>}
              </label>
            </div>
            <button onClick={handleStep2} disabled={loading || !slipFile} style={{ width: '100%', background: loading || !slipFile ? '#eee' : '#CC0001', color: loading || !slipFile ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '14px', fontSize: 15, fontWeight: 800, fontFamily: 'var(--font-oswald)', cursor: 'pointer' }}>
              {loading ? 'กำลังอัปโหลด...' : 'ยืนยันการสมัคร'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '40px 20px' }}>
            <CheckCircle size={64} color="#16a34a" strokeWidth={1.5} style={{ marginBottom: 16 }} />
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>สมัครสำเร็จ!</div>
            <p style={{ fontSize: 14, color: '#888', marginBottom: 24 }}>รอ Organizer ยืนยันการสมัครนะครับ</p>
            <Link href="/tournaments" style={{ background: '#CC0001', color: 'white', borderRadius: 10, padding: '12px 24px', fontSize: 14, fontWeight: 800, textDecoration: 'none', fontFamily: 'var(--font-oswald)' }}>
              กลับหน้ารายการแข่ง
            </Link>
          </div>
        )}
      </div>
    </main>
  )
}