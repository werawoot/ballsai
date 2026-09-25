'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trophy, ArrowLeft, CheckCircle, Upload, Copy, Banknote } from 'lucide-react'
import { requestErrorText, requestJson, shouldStartAction } from '@/lib/pending-action'
import Link from 'next/link'
import Image from 'next/image'

type Tournament = {
  id: string
  name: string
  fee: number
  promptpay: string | null
}

export default function RegisterPage({ params }: { params: { id: string } }) {
  const searchParams = useSearchParams()
  const requestedTeamId = searchParams.get('teamId') ?? ''
  const [step, setStep] = useState<'form' | 'payment' | 'success'>(() => requestedTeamId ? 'payment' : 'form')
  // `disabled` cannot stop a second tap in the same tick, and the slip upload is the
  // slowest request in the app on a phone, so it is the easiest one to double-tap.
  const inFlight = useRef<string | null>(null)
  // The ref refuses the next tap synchronously; the state is what re-renders both
  // buttons as disabled, so the lock never depends on the message setState.
  const outcomeUnknown = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)
  const [teamName, setTeamName] = useState('')
  const [teamId, setTeamId] = useState(requestedTeamId)
  const [slipFile, setSlipFile] = useState<File | null>(null)
  const [slipPreview, setSlipPreview] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [tournament, setTournament] = useState<Tournament | null>(null)
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
  }, [params.id])

  const handleSubmitTeam = async () => {
    if (!teamName.trim()) return
    if (!shouldStartAction(inFlight.current) || outcomeUnknown.current) return
    inFlight.current = 'team'
    setLoading(true)
    setMessage('')

    try {
      const outcome = await requestJson<{ error?: string; teamId?: string }>(
        `/api/tournaments/${params.id}/teams`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: teamName,
          }),
        },
      )

      if (!outcome.ok && outcome.kind === 'http' && outcome.status === 401) {
        router.push('/login')
        return
      }

      if (!outcome.ok) {
        // The team may already exist with only the response lost. Creating a second one
        // would put two teams in the same tournament, so send them to check first.
        if (outcome.kind === 'network') { outcomeUnknown.current = true; setNeedsReload(true) }
        setMessage(requestErrorText(outcome, { fallback: 'เกิดข้อผิดพลาดในการสมัครทีม', mutating: true }))
        return
      }

      if (!outcome.data?.teamId) {
        setMessage('เกิดข้อผิดพลาดในการสมัครทีม')
        return
      }

      setTeamId(outcome.data.teamId)
      router.push(`/team-members?team=${encodeURIComponent(outcome.data.teamId)}`)
    } finally {
      setLoading(false)
      inFlight.current = null
    }
  }

  const handleSlipChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setSlipFile(file)
    setSlipPreview(URL.createObjectURL(file))
  }

  const handleUploadSlip = async () => {
    if (!slipFile) return
    if (!shouldStartAction(inFlight.current) || outcomeUnknown.current) return
    inFlight.current = 'slip'
    setLoading(true)
    setMessage('')

    const formData = new FormData()
    formData.append('slip', slipFile)

    try {
      const outcome = await requestJson(`/api/teams/${teamId}/payment`, {
        method: 'POST',
        body: formData,
      })

      if (!outcome.ok && outcome.kind === 'http' && outcome.status === 401) {
        router.push('/login')
        return
      }

      if (!outcome.ok) {
        // A slip that reached the server but lost its response is already recorded, and
        // the API rejects a second one. Ask them to re-check rather than re-upload.
        if (outcome.kind === 'network') { outcomeUnknown.current = true; setNeedsReload(true) }
        setMessage(requestErrorText(outcome, { fallback: 'บันทึกการชำระเงินไม่สำเร็จ', mutating: true }))
        return
      }

      setStep('success')
    } finally {
      setLoading(false)
      inFlight.current = null
    }
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
    <main className="bds-page" style={{ background: '#f8f8f8', minHeight: '100vh', overflowX: 'hidden', paddingBottom: 40 }}>

      <header className="bds-header" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BallDoenSai.com
        </Link>
        <button onClick={() => router.back()} style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>
          <ArrowLeft size={16} /> กลับ
        </button>
      </header>

      {/* STEP INDICATOR */}
      <div className="bds-hero" style={{ background: '#CC0001', padding: '0 16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {['สร้างทีม', 'เชิญสมาชิก', 'ส่งสมัคร & ชำระเงิน'].map((label, i) => {
            const isActive = i === 0 && step === 'form'
            const isDone = false
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
          <aside style={{ marginBottom: 12, background: '#eef6ff', border: '1px solid #bfdbfe', borderRadius: 12, padding: '12px 14px', color: '#1e3a5f', fontSize: 13, lineHeight: 1.55 }}>
            <strong>สำหรับนักกีฬา:</strong> ดูรายละเอียดรายการนี้ได้เลย แต่การเข้าร่วมต้องให้โค้ชหรือผู้จัดสร้างทีมและเชิญบัญชีของคุณก่อน
            <Link href="/team-members" style={{ display: 'inline-block', marginLeft: 6, color: '#CC0001', fontWeight: 800, textDecoration: 'none' }}>ดูคำเชิญของฉัน →</Link>
          </aside>
        )}

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
            <div style={{ background: '#fff8f7', border: '1px solid #f2d0d0', borderRadius: 10, padding: '12px 14px', color: '#7f1d1d', fontSize: 13, lineHeight: 1.55, marginBottom: 24 }}>
              สร้างทีมก่อน แล้วเชิญนักกีฬาด้วยอีเมลให้กดตอบรับ จากนั้นจึงส่งสมัครและอัปโหลดสลิป
            </div>
            {message && <p style={{ textAlign: 'center', fontSize: 13, color: '#CC0001', fontWeight: 600, marginBottom: 14 }}>{message}</p>}
            {needsReload && <button type="button" onClick={() => window.location.reload()} style={{ width: '100%', marginBottom: 12, background: '#111', color: 'white', border: 'none', borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>โหลดหน้าใหม่เพื่อตรวจว่าทีมถูกสร้างแล้วหรือยัง</button>}
            <button onClick={handleSubmitTeam} disabled={loading || needsReload || !teamName} style={{ width: '100%', background: loading || needsReload || !teamName ? '#eee' : '#CC0001', color: loading || needsReload || !teamName ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading || needsReload || !teamName ? 'default' : 'pointer' }}>
              {loading ? 'กำลังสร้าง...' : 'สร้างทีมและเชิญสมาชิก'}
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
                    <Image src={slipPreview} alt="slip" width={640} height={900} unoptimized style={{ width: '100%', maxHeight: 300, height: 'auto', objectFit: 'contain', display: 'block' }} />
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
            {needsReload && <button type="button" onClick={() => window.location.reload()} style={{ width: '100%', background: '#111', color: 'white', border: 'none', borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>โหลดหน้าใหม่เพื่อตรวจว่าสลิปถูกบันทึกแล้วหรือยัง</button>}

            <button onClick={handleUploadSlip} disabled={loading || needsReload || !slipFile} style={{ width: '100%', background: loading || needsReload || !slipFile ? '#eee' : '#CC0001', color: loading || needsReload || !slipFile ? '#aaa' : 'white', border: 'none', borderRadius: 12, padding: '15px', fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 1, cursor: loading || needsReload || !slipFile ? 'default' : 'pointer' }}>
              {loading ? 'กำลังส่ง...' : 'ยืนยันการชำระเงิน'}
            </button>
          </div>
        )}

      </div>
    </main>
  )
}
