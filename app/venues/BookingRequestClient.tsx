'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CalendarDays, Send } from 'lucide-react'

export type AvailableSlot = { id: string; starts_at: string; ends_at: string; price_baht: number; venue_courts: { name: string; sport: string } | null }

export default function BookingRequestClient({ slots }: { slots: AvailableSlot[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState(slots[0]?.id ?? '')
  const [purpose, setPurpose] = useState('ซ้อมทีม')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const format = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const submit = async () => {
    if (!selected || !purpose.trim()) return
    setBusy(true); setMessage('')
    const response = await fetch('/api/venue-bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId: selected, purpose, note }) })
    const result = await response.json().catch(() => null) as { error?: string } | null
    setBusy(false)
    if (response.status === 401) { router.push(`${'/login?next='}${encodeURIComponent('/venues/bookings')}`); return }
    if (!response.ok) { setMessage(result?.error ?? 'ส่งคำขอไม่สำเร็จ'); return }
    setMessage('ส่งคำขอแล้ว รอเจ้าของสนามยืนยัน')
  }

  if (!slots.length) return <p style={{ margin: 0, color: '#687586', fontSize: 13 }}>ยังไม่มีช่วงเวลาว่างที่เปิดให้ขอจอง</p>
  return <section style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 17 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CalendarDays size={19} color="#f5c518" /><div><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.2 }}>REQUEST A SLOT</p><h2 style={{ margin: '2px 0 0', fontSize: 20 }}>ส่งคำขอจอง</h2></div></div>
    <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>{slots.map(slot => <label key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 10, border: `1px solid ${selected === slot.id ? '#f5c518' : 'rgba(255,255,255,.17)'}`, background: selected === slot.id ? 'rgba(245,197,24,.12)' : 'transparent', borderRadius: 9, cursor: 'pointer' }}><input checked={selected === slot.id} onChange={() => setSelected(slot.id)} type="radio" name="slot" /><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13 }}>{slot.venue_courts?.name ?? 'พื้นที่เล่น'} · {slot.venue_courts?.sport === 'futsal' ? 'ฟุตซอล' : 'ฟุตบอล'}</b><small style={{ color: 'rgba(255,255,255,.68)' }}>{format(slot.starts_at)} – {new Intl.DateTimeFormat('th-TH', { timeStyle: 'short' }).format(new Date(slot.ends_at))}</small></span><b style={{ color: '#f5c518' }}>฿{slot.price_baht.toLocaleString()}</b></label>)}</div>
    <label style={{ display: 'block', marginTop: 12 }}><span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,.65)', marginBottom: 5 }}>วัตถุประสงค์</span><input value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="เช่น ซ้อมทีม U16" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: 'white' }} /></label>
    <label style={{ display: 'block', marginTop: 10 }}><span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,.65)', marginBottom: 5 }}>หมายเหตุ (ถ้ามี)</span><textarea value={note} onChange={event => setNote(event.target.value)} rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: 'white', resize: 'vertical' }} /></label>
    {message && <p role="status" style={{ background: message.includes('ไม่สำเร็จ') || message.includes('มีคำขอ') ? '#7f1d1d' : '#14532d', borderRadius: 8, padding: 9, fontSize: 12, margin: '12px 0 0' }}>{message}</p>}
    <button type="button" disabled={busy || !selected || !purpose.trim()} onClick={submit} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, width: '100%', marginTop: 12, padding: 11, border: 0, borderRadius: 8, background: '#f5c518', color: '#101827', fontWeight: 900, cursor: 'pointer' }}><Send size={15} /> {busy ? 'กำลังส่ง...' : 'ส่งคำขอจอง'}</button>
  </section>
}
