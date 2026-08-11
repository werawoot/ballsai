'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

const CONFIRM_PHRASE = 'ลบข้อมูลของฉัน'

// PDPA gives the athlete a way out, and it has to be readable by a child and their
// guardian: what disappears, what stays, and why.
export default function DeleteMyDataSection() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)

  const submit = async () => {
    setLoading(true)
    setMessage(null)
    const response = await fetch('/api/account/delete-athlete-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm }),
    })
    const payload = await response.json().catch(() => null) as { error?: string; removedHighlights?: number } | null
    setLoading(false)

    if (!response.ok) {
      setMessage({ kind: 'error', text: payload?.error ?? 'ลบข้อมูลไม่สำเร็จ' })
      return
    }

    setConfirm('')
    setOpen(false)
    setMessage({
      kind: 'success',
      text: `ลบข้อมูลนักกีฬาของคุณแล้ว · ลบ Highlight ${payload?.removedHighlights ?? 0} รายการ · ทีมดูแลจะปิดบัญชีให้ในขั้นตอนสุดท้าย`,
    })
    router.refresh()
  }

  return (
    <section style={{ background: 'white', border: '1.5px solid #f2d0d0', borderRadius: 12, padding: 18, marginTop: 16 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 12 }}>
        <span style={{ width: 32, height: 32, borderRadius: 8, background: '#fff1f1', color: '#CC0001', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <AlertTriangle size={17} />
        </span>
        <span>
          <span style={{ display: 'block', fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, color: '#111' }}>ลบข้อมูลของฉัน</span>
          <span style={{ display: 'block', fontSize: 11, color: '#888', marginTop: 2 }}>สิทธิ์ตาม PDPA · ทำแล้วย้อนกลับไม่ได้</span>
        </span>
      </div>

      <ul style={{ margin: '0 0 12px', paddingLeft: 18, fontSize: 12, color: '#555', lineHeight: 1.8 }}>
        <li><b>ลบทันที:</b> โปรไฟล์นักกีฬา, รูป, วิดีโอและ Highlight ที่อัปโหลด, ผลงาน, XP, Level และ Badge ทั้งหมด</li>
        <li><b>เก็บไว้แต่ลบชื่อออก:</b> ประวัติผลการแข่งขันของรายการที่คุณลงเล่น เพราะเป็นคะแนนที่ทีมอื่นถูกวัดด้วย ระบบจะตัดชื่อและการเชื่อมโยงกับบัญชีของคุณออก</li>
        <li><b>ขั้นตอนสุดท้าย:</b> ทีมดูแลจะปิดบัญชีและอีเมลของคุณออกจากระบบให้ หลังได้รับคำขอนี้</li>
      </ul>

      <p style={{ fontSize: 11, color: '#888', margin: '0 0 12px', lineHeight: 1.6 }}>
        อ่านรายละเอียดได้ที่ <Link href="/privacy" style={{ color: '#CC0001', fontWeight: 700 }}>นโยบายความเป็นส่วนตัว</Link> · ถ้าเป็นผู้เยาว์ ควรให้ผู้ปกครองอยู่ด้วยตอนทำรายการนี้
      </p>

      {message && (
        <div style={{ background: message.kind === 'success' ? '#dcfce7' : '#fee2e2', color: message.kind === 'success' ? '#166534' : '#991b1b', borderRadius: 10, padding: '10px 12px', fontSize: 12, fontWeight: 700, lineHeight: 1.6, marginBottom: 12 }}>
          {message.text}
        </div>
      )}

      {!open ? (
        <button onClick={() => setOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'white', color: '#CC0001', border: '1.5px solid #f2d0d0', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>
          <Trash2 size={15} /> ขอลบข้อมูลของฉัน
        </button>
      ) : (
        <div>
          <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#666', marginBottom: 6 }}>
            พิมพ์ “{CONFIRM_PHRASE}” เพื่อยืนยัน
          </label>
          <input
            value={confirm}
            onChange={event => setConfirm(event.target.value)}
            placeholder={CONFIRM_PHRASE}
            style={{ width: '100%', minHeight: 44, border: '1.5px solid #e5e5e5', borderRadius: 8, padding: '10px 12px', fontSize: 14, outline: 'none', fontFamily: 'var(--font-sarabun)', color: '#111', background: '#fafafa' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={submit}
              disabled={loading || confirm.trim() !== CONFIRM_PHRASE}
              style={{ display: 'flex', alignItems: 'center', gap: 6, background: confirm.trim() === CONFIRM_PHRASE ? '#CC0001' : '#eee', color: confirm.trim() === CONFIRM_PHRASE ? 'white' : '#aaa', border: 'none', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 800, cursor: loading || confirm.trim() !== CONFIRM_PHRASE ? 'default' : 'pointer' }}
            >
              {loading ? <Loader2 size={15} /> : <Trash2 size={15} />} {loading ? 'กำลังลบ...' : 'ยืนยันการลบ'}
            </button>
            <button onClick={() => { setOpen(false); setConfirm('') }} disabled={loading} style={{ background: 'white', color: '#555', border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '11px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
              ยกเลิก
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
