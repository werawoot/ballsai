'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CalendarCheck2, CalendarDays, Send } from 'lucide-react'
import { bookingRequestView } from '@/lib/venue-booking-request'
import { formatVenueBookingDateTime, formatVenueBookingTime } from '@/lib/venue-booking-time'
import { VENUE_PENDING_COPY, pendingButton, shouldStartAction } from '@/lib/pending-action'

export type AvailableSlot = { id: string; starts_at: string; ends_at: string; price_baht: number; venue_courts: { name: string; sport: string } | null }

export default function BookingRequestClient({ slots }: { slots: AvailableSlot[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState(slots[0]?.id ?? '')
  const [purpose, setPurpose] = useState('ซ้อมทีม')
  const [note, setNote] = useState('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const view = bookingRequestView({ submitted, selected, slots })
  const send = pendingButton({
    pending,
    key: 'booking',
    ...VENUE_PENDING_COPY.booking,
    disabled: !view.canSubmit || !view.selected || !purpose.trim(),
  })
  const submit = async () => {
    if (!shouldStartAction(pending) || !view.canSubmit || !view.selected || !purpose.trim()) return
    setPending('booking'); setFeedback(null)
    const response = await fetch('/api/venue-bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slotId: view.selected, purpose, note }) }).catch(() => null)
    const result = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setPending(null)
    if (response?.status === 401) { router.push(`${'/login?next='}${encodeURIComponent('/venues/bookings')}`); return }
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', text: result?.error ?? 'ส่งคำขอไม่สำเร็จ' })
      // A 409 means the slot list is stale; refresh so the taken slot disappears.
      if (response?.status === 409) router.refresh()
      return
    }
    setFeedback({ tone: 'success', text: 'ส่งคำขอแล้ว รอเจ้าของสนามยืนยัน' })
    setNote('')
    // Lock the form behind a confirmation. The slot is reserved now, so re-sending it
    // would only fail, and refresh() alone would leave a stale id selected.
    setSubmitted(true)
    router.refresh()
  }

  // bookingRequestView re-resolves the selection from the refreshed slots, so this
  // only has to leave the confirmation.
  const startAnother = () => {
    setSubmitted(false)
    setFeedback(null)
  }

  if (view.mode === 'success') return <section style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 17 }}>
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}><CalendarCheck2 size={22} color="#4ade80" /><div style={{ minWidth: 0 }}><h2 style={{ margin: 0, fontSize: 19 }}>ส่งคำขอจองแล้ว</h2><p role="status" aria-live="polite" style={{ margin: '6px 0 0', color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 1.55 }}>รอเจ้าของสนามยืนยัน คุณจะเห็นสถานะล่าสุดได้ในหน้าคำขอของฉัน</p></div></div>
    <Link href="/venues/bookings" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, marginTop: 14, padding: 11, borderRadius: 8, background: '#f5c518', color: '#101827', fontWeight: 900, textDecoration: 'none' }}><CalendarDays size={15} /> ดูคำขอของฉัน</Link>
    {slots.length > 0 && <button type="button" onClick={startAnother} style={{ width: '100%', marginTop: 9, padding: 10, borderRadius: 8, border: '1px solid rgba(255,255,255,.25)', background: 'transparent', color: 'white', fontWeight: 800, cursor: 'pointer' }}>ขอจองช่วงเวลาอื่นอีก</button>}
  </section>

  if (view.mode === 'empty') return <p style={{ margin: 0, color: '#687586', fontSize: 13 }}>ยังไม่มีช่วงเวลาว่างที่เปิดให้ขอจอง</p>
  return <section style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 17 }}>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CalendarDays size={19} color="#f5c518" /><div><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.2 }}>REQUEST A SLOT</p><h2 style={{ margin: '2px 0 0', fontSize: 20 }}>ส่งคำขอจอง</h2></div></div>
    <div role="radiogroup" aria-label="เลือกช่วงเวลาที่ต้องการจอง" style={{ display: 'grid', gap: 8, marginTop: 14 }}>{slots.map(slot => <label key={slot.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: 10, border: `1px solid ${view.selected === slot.id ? '#f5c518' : 'rgba(255,255,255,.17)'}`, background: view.selected === slot.id ? 'rgba(245,197,24,.12)' : 'transparent', borderRadius: 9, cursor: 'pointer' }}><input checked={view.selected === slot.id} onChange={() => setSelected(slot.id)} type="radio" name="slot" /><span style={{ flex: 1 }}><b style={{ display: 'block', fontSize: 13 }}>{slot.venue_courts?.name ?? 'พื้นที่เล่น'} · {slot.venue_courts?.sport === 'futsal' ? 'ฟุตซอล' : 'ฟุตบอล'}</b><small style={{ color: 'rgba(255,255,255,.68)' }}>{formatVenueBookingDateTime(slot.starts_at)} – {formatVenueBookingTime(slot.ends_at)}</small></span><b style={{ color: '#f5c518' }}>฿{slot.price_baht.toLocaleString()}</b></label>)}</div>
    <label style={{ display: 'block', marginTop: 12 }}><span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,.65)', marginBottom: 5 }}>วัตถุประสงค์</span><input value={purpose} onChange={event => setPurpose(event.target.value)} placeholder="เช่น ซ้อมทีม U16" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: 'white' }} /></label>
    <label style={{ display: 'block', marginTop: 10 }}><span style={{ display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: 1, color: 'rgba(255,255,255,.65)', marginBottom: 5 }}>หมายเหตุ (ถ้ามี)</span><textarea value={note} onChange={event => setNote(event.target.value)} rows={2} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,.2)', background: 'rgba(255,255,255,.08)', color: 'white', resize: 'vertical' }} /></label>
    {feedback && <p role="status" aria-live="polite" style={{ background: feedback.tone === 'error' ? '#7f1d1d' : '#14532d', borderRadius: 8, padding: 9, fontSize: 12, margin: '12px 0 0' }}>{feedback.text}</p>}
    <button type="button" aria-busy={send['aria-busy']} disabled={send.disabled} onClick={submit} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 7, width: '100%', marginTop: 12, padding: 11, border: 0, borderRadius: 8, background: '#f5c518', color: '#101827', fontWeight: 900, cursor: send.disabled ? 'not-allowed' : 'pointer' }}><Send size={15} /> {send.label}</button>
  </section>
}
