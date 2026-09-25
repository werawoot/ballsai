'use client'

import { useRef, useState } from 'react'
import { Flag, LoaderCircle } from 'lucide-react'
import { requestJson, requestErrorText } from '@/lib/pending-action'

type Props = { subjectType: 'athlete_profile' | 'player_rank'; subjectId: string }

export default function DisputeDataButton({ subjectType, subjectId }: Props) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('ranking')
  const [description, setDescription] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')
  const [networkMessage, setNetworkMessage] = useState('')
  const inFlight = useRef(false)
  // The ref refuses the next click synchronously; the state is what re-renders the
  // control as disabled, so the lock never depends on some other setState.
  const outcomeUnknown = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)

  async function submit() {
    if (inFlight.current || outcomeUnknown.current) return
    if (description.trim().length < 10) { setState('error'); return }
    inFlight.current = true
    setState('sending')
    try {
      const result = await requestJson('/api/data-disputes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subjectType, subjectId, category, description }) })
      if (result.ok) { setState('success'); setDescription(''); return }
      if (result.kind === 'network') {
        outcomeUnknown.current = true; setNeedsReload(true)
        setNetworkMessage(requestErrorText(result, { fallback: '', mutating: true }))
      }
      setState('error')
    } finally {
      inFlight.current = false
    }
  }

  return <div style={{ marginTop: 12 }}>
    <button type="button" onClick={() => setOpen(value => !value)} style={{ alignItems: 'center', background: 'transparent', border: '1px solid #c8b983', borderRadius: 6, color: '#6e5300', cursor: 'pointer', display: 'inline-flex', fontSize: 11, fontWeight: 800, gap: 6, padding: '7px 9px' }}><Flag size={14} /> คัดค้านข้อมูลนี้</button>
    {open && <div style={{ background: 'white', border: '1px solid #e6dfc6', borderRadius: 8, marginTop: 8, padding: 12 }}>
      <label style={{ color: '#5e543b', display: 'block', fontSize: 11, fontWeight: 800 }}>หัวข้อ</label>
      <select value={category} onChange={event => setCategory(event.target.value)} style={{ border: '1px solid #d8d1bc', borderRadius: 5, marginTop: 5, padding: 8, width: '100%' }}><option value="ranking">อันดับหรือคะแนน</option><option value="statistics">สถิติ</option><option value="identity">ข้อมูลโปรไฟล์</option><option value="match_result">ผลการแข่งขัน</option><option value="other">อื่น ๆ</option></select>
      <label style={{ color: '#5e543b', display: 'block', fontSize: 11, fontWeight: 800, marginTop: 10 }}>รายละเอียด</label>
      <textarea value={description} onChange={event => { setDescription(event.target.value); setState('idle') }} minLength={10} maxLength={2000} placeholder="บอกสิ่งที่ไม่ถูกต้องและหลักฐานที่เกี่ยวข้อง" style={{ border: '1px solid #d8d1bc', borderRadius: 5, boxSizing: 'border-box', font: 'inherit', marginTop: 5, minHeight: 82, padding: 8, resize: 'vertical', width: '100%' }} />
      {needsReload && <button type="button" onClick={() => window.location.reload()} style={{ width: '100%', marginTop: 8, padding: 9, fontSize: 11, border: 0, borderRadius: 8, background: '#111', color: 'white', fontWeight: 800, cursor: 'pointer' }}>โหลดหน้าใหม่เพื่อตรวจว่าคำทักท้วงถูกส่งแล้วหรือยัง</button>}
      <div style={{ alignItems: 'center', display: 'flex', gap: 8, marginTop: 8 }}><button type="button" disabled={state === 'sending' || needsReload} onClick={submit} style={{ alignItems: 'center', background: '#172033', border: 0, borderRadius: 5, color: 'white', cursor: 'pointer', display: 'inline-flex', fontSize: 11, fontWeight: 800, gap: 6, padding: '8px 10px' }}>{state === 'sending' && <LoaderCircle size={13} className="spin" />} ส่งคำคัดค้าน</button>{state === 'success' && <span style={{ color: '#087443', fontSize: 11, fontWeight: 700 }}>รับเรื่องแล้ว</span>}{state === 'error' && <span style={{ color: '#b42318', fontSize: 11 }}>{networkMessage || 'ตรวจรายละเอียดอย่างน้อย 10 ตัวอักษร หรือระบบยังไม่เปิดใช้'}</span>}</div>
    </div>}
  </div>
}
