'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, CalendarPlus, CalendarX2, Check, CircleDollarSign, Clock3, MapPin, Plus, X } from 'lucide-react'

export type VenueSlot = { id: string; starts_at: string; ends_at: string; price_baht: number; status: 'open' | 'blocked' }
export type VenueCourt = { id: string; name: string; sport: 'football' | 'futsal'; surface: string; capacity: number | null; venue_slots: VenueSlot[] | null }
export type OwnerVenue = { id: string; name: string; province: string; address: string; contact_phone: string; description: string; amenities: string[]; venue_courts: VenueCourt[] | null }
export type OwnerBooking = {
  id: string; status: 'pending' | 'confirmed' | 'declined' | 'cancelled'; purpose: string; note: string; requested_at: string
  venue_slots: { starts_at: string; ends_at: string; price_baht: number; venue_courts: { name: string; venue_profiles: { name: string } | null } | null } | null
}

const fieldStyle = { width: '100%', boxSizing: 'border-box' as const, border: '1px solid #d9dde2', borderRadius: 9, minHeight: 42, padding: '9px 11px', font: '600 14px var(--font-sarabun)', color: '#172033', background: '#fff' }
const labelStyle = { display: 'block', color: '#546070', font: '800 10px var(--font-oswald)', letterSpacing: 1.1, margin: '0 0 6px' }
const statusStyle: Record<OwnerBooking['status'], { background: string; color: string; label: string }> = {
  pending: { background: '#fff3c7', color: '#925d00', label: 'รอตอบรับ' },
  confirmed: { background: '#dcfce7', color: '#166534', label: 'ยืนยันแล้ว' },
  declined: { background: '#fee2e2', color: '#b91c1c', label: 'ปฏิเสธ' },
  cancelled: { background: '#e5e7eb', color: '#4b5563', label: 'ยกเลิก' },
}

export default function VenueOwnerClient({ venues, bookings }: { venues: OwnerVenue[]; bookings: OwnerBooking[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const [showCreate, setShowCreate] = useState(venues.length === 0)
  const [venueForm, setVenueForm] = useState({ name: '', province: '', address: '', contactPhone: '', description: '', amenities: '' })
  const [courtForm, setCourtForm] = useState({ venueId: venues[0]?.id ?? '', name: '', sport: 'football' as 'football' | 'futsal', surface: '', capacity: '' })
  const [slotForm, setSlotForm] = useState({ courtId: venues[0]?.venue_courts?.[0]?.id ?? '', startsAt: '', endsAt: '', priceBaht: '' })

  const succeed = (text: string) => setFeedback({ tone: 'success', text })

  const request = async (path: string, method: string, body?: unknown) => {
    setBusy(true); setFeedback(null)
    const response = await fetch(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }).catch(() => null)
    const data = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setBusy(false)
    if (!response || !response.ok) {
      setFeedback({ tone: 'error', text: data?.error ?? 'ดำเนินการไม่สำเร็จ' })
      return false
    }
    router.refresh(); return true
  }

  const createVenue = async () => {
    const ok = await request('/api/venues', 'POST', { ...venueForm, amenities: venueForm.amenities.split(',').map(item => item.trim()).filter(Boolean) })
    if (ok) { setShowCreate(false); succeed('สร้างโปรไฟล์สนามแล้ว เพิ่มพื้นที่เล่นและช่วงเวลาว่างต่อได้เลย') }
  }
  const createCourt = async () => {
    if (!courtForm.venueId) return
    const ok = await request(`/api/venues/${courtForm.venueId}/courts`, 'POST', { ...courtForm, capacity: courtForm.capacity ? Number(courtForm.capacity) : null })
    if (ok) { setCourtForm(value => ({ ...value, name: '', surface: '', capacity: '' })); succeed('เพิ่มพื้นที่เล่นแล้ว') }
  }
  const createSlot = async () => {
    if (!slotForm.courtId) return
    const ok = await request('/api/venue-slots', 'POST', { ...slotForm, priceBaht: Number(slotForm.priceBaht) })
    if (ok) { setSlotForm(value => ({ ...value, startsAt: '', endsAt: '', priceBaht: '' })); succeed('เปิดช่วงเวลาว่างแล้ว') }
  }
  const respond = async (bookingId: string, status: 'confirmed' | 'declined') => {
    const ok = await request(`/api/venue-bookings/${bookingId}`, 'PATCH', { status })
    if (ok) succeed(status === 'confirmed' ? 'ยืนยันการจองแล้ว' : 'ปฏิเสธคำขอแล้ว')
  }
  const closeSlot = async (slotId: string) => {
    if (!window.confirm('ปิดช่วงเวลานี้ใช่ไหม? ผู้ใช้จะไม่เห็นช่วงเวลานี้สำหรับการจองใหม่')) return
    const ok = await request(`/api/venue-slots/${slotId}`, 'DELETE')
    if (ok) succeed('ปิดช่วงเวลาแล้ว')
  }

  const courts = venues.flatMap(venue => (venue.venue_courts ?? []).map(court => ({ ...court, venueName: venue.name })))
  const openSlots = courts.flatMap(court => (court.venue_slots ?? []).filter(slot => slot.status === 'open').map(slot => ({ ...slot, courtName: court.name, venueName: court.venueName }))).sort((a, b) => new Date(a.starts_at).valueOf() - new Date(b.starts_at).valueOf())
  const input = (label: string, value: string, onChange: (value: string) => void, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => <label><span style={labelStyle}>{label}</span><input {...props} value={value} onChange={event => onChange(event.target.value)} style={fieldStyle} /></label>

  return <div style={{ display: 'grid', gap: 16 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '11px 13px', borderRadius: 10, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 13, fontWeight: 700 }}>{feedback.text}</p>}

    <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
      <div style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 16 }}><Building2 size={18} color="#f5c518" /><b style={{ display: 'block', font: '800 28px var(--font-oswald)', marginTop: 7 }}>{venues.length}</b><span style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>สนามของฉัน</span></div>
      <div style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 16 }}><Clock3 size={18} color="#CC0001" /><b style={{ display: 'block', font: '800 28px var(--font-oswald)', marginTop: 7 }}>{bookings.filter(item => item.status === 'pending').length}</b><span style={{ fontSize: 12, color: '#667085' }}>คำขอรอตอบรับ</span></div>
      <div style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 16 }}><Check size={18} color="#16803d" /><b style={{ display: 'block', font: '800 28px var(--font-oswald)', marginTop: 7 }}>{bookings.filter(item => item.status === 'confirmed').length}</b><span style={{ fontSize: 12, color: '#667085' }}>ยืนยันแล้ว</span></div>
    </section>

    {showCreate && <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderTop: '4px solid #CC0001', borderRadius: 14, padding: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 15 }}><Building2 size={20} color="#CC0001" /><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>VENUE SETUP</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>สร้างโปรไฟล์สนาม</h2></div></div>
      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
        {input('ชื่อสนาม', venueForm.name, value => setVenueForm({ ...venueForm, name: value }), { placeholder: 'เช่น BALLSAI Arena' })}
        {input('จังหวัด', venueForm.province, value => setVenueForm({ ...venueForm, province: value }), { placeholder: 'เช่น กรุงเทพมหานคร' })}
        {input('เบอร์โทร/LINE', venueForm.contactPhone, value => setVenueForm({ ...venueForm, contactPhone: value }), { placeholder: 'เช่น 081-234-5678' })}
        {input('ที่อยู่', venueForm.address, value => setVenueForm({ ...venueForm, address: value }), { placeholder: 'รายละเอียดพื้นที่' })}
      </div>
      <label style={{ display: 'block', marginTop: 11 }}><span style={labelStyle}>สิ่งอำนวยความสะดวก (คั่นด้วย ,)</span><input value={venueForm.amenities} onChange={event => setVenueForm({ ...venueForm, amenities: event.target.value })} placeholder="ที่จอดรถ, ห้องน้ำ, ไฟสนาม" style={fieldStyle} /></label>
      <label style={{ display: 'block', marginTop: 11 }}><span style={labelStyle}>รายละเอียด</span><textarea value={venueForm.description} onChange={event => setVenueForm({ ...venueForm, description: event.target.value })} rows={3} placeholder="บอกจุดเด่นหรือข้อควรรู้ของสนาม" style={{ ...fieldStyle, minHeight: 80, resize: 'vertical' }} /></label>
      <button type="button" disabled={busy} onClick={createVenue} style={{ marginTop: 15, width: '100%', border: 0, borderRadius: 9, padding: 12, background: '#CC0001', color: 'white', fontWeight: 900, cursor: 'pointer' }}>{busy ? 'กำลังบันทึก...' : 'เปิดโปรไฟล์สนาม'}</button>
    </section>}

    {venues.length > 0 && <>
      <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>MY VENUES</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>สนามที่เผยแพร่</h2></div><button type="button" onClick={() => setShowCreate(true)} style={{ border: '1px solid #d9dde2', background: '#fff', padding: '8px 10px', borderRadius: 8, fontWeight: 800, color: '#172033', cursor: 'pointer' }}><Plus size={15} /> เพิ่มสนาม</button></div>
        <div style={{ display: 'grid', gap: 10 }}>{venues.map(venue => <article key={venue.id} style={{ background: '#f7f7f5', borderRadius: 11, padding: 13 }}><b>{venue.name}</b><p style={{ color: '#697586', fontSize: 12, margin: '4px 0 8px', display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={13} /> {venue.province} · {venue.address}</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(venue.venue_courts ?? []).length ? venue.venue_courts?.map(court => <span key={court.id} style={{ background: 'white', border: '1px solid #e0e4e8', padding: '4px 7px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>{court.name} · {court.sport === 'football' ? 'ฟุตบอล' : 'ฟุตซอล'}</span>) : <span style={{ color: '#a16207', fontSize: 12 }}>ยังไม่มีพื้นที่เล่น</span>}</div></article>)}</div>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}>
        <form onSubmit={event => { event.preventDefault(); void createCourt() }} style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><Plus size={19} color="#CC0001" /><h2 style={{ margin: 0, fontSize: 19 }}>เพิ่มพื้นที่เล่น</h2></div><div style={{ display: 'grid', gap: 10 }}><label><span style={labelStyle}>สนาม</span><select value={courtForm.venueId} onChange={event => setCourtForm({ ...courtForm, venueId: event.target.value })} style={fieldStyle}>{venues.map(venue => <option value={venue.id} key={venue.id}>{venue.name}</option>)}</select></label>{input('ชื่อพื้นที่', courtForm.name, value => setCourtForm({ ...courtForm, name: value }), { placeholder: 'เช่น สนาม 5A' })}<label><span style={labelStyle}>ประเภทกีฬา</span><select value={courtForm.sport} onChange={event => setCourtForm({ ...courtForm, sport: event.target.value as 'football' | 'futsal' })} style={fieldStyle}><option value="football">ฟุตบอล</option><option value="futsal">ฟุตซอล</option></select></label>{input('พื้นสนาม', courtForm.surface, value => setCourtForm({ ...courtForm, surface: value }), { placeholder: 'เช่น หญ้าเทียม' })}{input('จำนวนผู้เล่น (ไม่บังคับ)', courtForm.capacity, value => setCourtForm({ ...courtForm, capacity: value }), { type: 'number', min: 1 })}</div><button disabled={busy} style={{ width: '100%', border: 0, borderRadius: 9, padding: 11, background: '#172033', color: 'white', fontWeight: 900, marginTop: 14 }}>เพิ่มพื้นที่เล่น</button></form>
        <form onSubmit={event => { event.preventDefault(); void createSlot() }} style={{ background: '#101827', color: 'white', borderRadius: 14, padding: 18 }}><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14 }}><CalendarPlus size={19} color="#f5c518" /><h2 style={{ margin: 0, fontSize: 19 }}>เปิดช่วงเวลาว่าง</h2></div>{courts.length === 0 ? <p style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: 1.5 }}>เพิ่มพื้นที่เล่นก่อน จึงจะเปิดเวลาว่างให้จองได้</p> : <div style={{ display: 'grid', gap: 10 }}><label><span style={{ ...labelStyle, color: 'rgba(255,255,255,.7)' }}>พื้นที่เล่น</span><select value={slotForm.courtId} onChange={event => setSlotForm({ ...slotForm, courtId: event.target.value })} style={fieldStyle}>{courts.map(court => <option value={court.id} key={court.id}>{court.venueName} · {court.name}</option>)}</select></label>{input('เริ่ม', slotForm.startsAt, value => setSlotForm({ ...slotForm, startsAt: value }), { type: 'datetime-local' })}{input('สิ้นสุด', slotForm.endsAt, value => setSlotForm({ ...slotForm, endsAt: value }), { type: 'datetime-local' })}{input('ราคา (บาท)', slotForm.priceBaht, value => setSlotForm({ ...slotForm, priceBaht: value }), { type: 'number', min: 0, placeholder: 'เช่น 800' })}<button disabled={busy} style={{ width: '100%', border: 0, borderRadius: 9, padding: 11, background: '#f5c518', color: '#101827', fontWeight: 900, marginTop: 4 }}>เปิดให้ส่งคำขอจอง</button></div>}</form>
      </section>

      <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}><Clock3 size={19} color="#CC0001" /><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>OPEN SLOTS</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>ช่วงเวลาที่เปิดรับจอง</h2></div></div>
        {openSlots.length === 0 ? <p style={{ color: '#788290', fontSize: 13, margin: 0 }}>ยังไม่มีช่วงเวลาที่เปิดอยู่ เพิ่มช่วงเวลาจากแบบฟอร์มด้านบนได้เลย</p> : <div style={{ display: 'grid', gap: 9 }}>{openSlots.map(slot => <article key={slot.id} style={{ border: '1px solid #e4e7eb', borderRadius: 11, padding: 13, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}><div><b>{slot.venueName} · {slot.courtName}</b><p style={{ margin: '4px 0 0', color: '#667085', fontSize: 12 }}>{new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(slot.starts_at))} – {new Intl.DateTimeFormat('th-TH', { timeStyle: 'short' }).format(new Date(slot.ends_at))} · ฿{slot.price_baht.toLocaleString('th-TH')}</p></div><button type="button" disabled={busy} onClick={() => void closeSlot(slot.id)} aria-label={`ปิดช่วงเวลา ${slot.venueName} ${slot.courtName}`} style={{ border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', padding: '8px 10px', fontWeight: 900, cursor: busy ? 'wait' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}><CalendarX2 size={15} /> ปิดเวลานี้</button></article>)}</div>}
      </section>
    </>}

    <section style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 18 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}><CircleDollarSign size={19} color="#CC0001" /><div><p style={{ ...labelStyle, color: '#CC0001', margin: 0 }}>BOOKING INBOX</p><h2 style={{ margin: '2px 0 0', fontSize: 21 }}>คำขอจองสนาม</h2></div></div>{bookings.length === 0 ? <p style={{ color: '#788290', fontSize: 13, margin: 0 }}>ยังไม่มีคำขอจอง เมื่อมีผู้ส่งคำขอจะปรากฏที่นี่</p> : <div style={{ display: 'grid', gap: 10 }}>{bookings.map(booking => { const info = booking.venue_slots; const style = statusStyle[booking.status]; return <article key={booking.id} style={{ border: '1px solid #e4e7eb', borderRadius: 11, padding: 13 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><div><b>{info?.venue_courts?.venue_profiles?.name ?? 'สนาม'}</b><p style={{ margin: '3px 0', color: '#667085', fontSize: 12 }}>{info?.venue_courts?.name ?? 'พื้นที่เล่น'} · {info ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(info.starts_at)) : ''}</p><p style={{ margin: 0, fontSize: 13 }}>{booking.purpose}</p></div><span style={{ background: style.background, color: style.color, height: 'fit-content', borderRadius: 20, padding: '4px 8px', fontSize: 10, fontWeight: 900 }}>{style.label}</span></div>{booking.note && <p style={{ color: '#667085', fontSize: 12, margin: '8px 0 0' }}>{booking.note}</p>}{booking.status === 'pending' && <div style={{ display: 'flex', gap: 8, marginTop: 11 }}><button disabled={busy} onClick={() => void respond(booking.id, 'confirmed')} style={{ flex: 1, border: 0, borderRadius: 8, background: '#15803d', color: 'white', padding: 9, fontWeight: 900 }}><Check size={14} /> ยืนยัน</button><button disabled={busy} onClick={() => void respond(booking.id, 'declined')} style={{ flex: 1, border: '1px solid #fecaca', borderRadius: 8, background: 'white', color: '#b91c1c', padding: 9, fontWeight: 900 }}><X size={14} /> ปฏิเสธ</button></div>}</article> })}</div>}</section>
  </div>
}
