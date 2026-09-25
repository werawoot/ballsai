'use client'

import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { OwnerVenue, OwnerBooking } from './VenueOwnerClient'
import { formatVenueBookingDateTime, formatVenueBookingTime } from '@/lib/venue-booking-time'
import styles from './operations.module.css'
import { requestJson, requestErrorText } from '@/lib/pending-action'

export function OfflinePaymentNotice() {
  return <p className={styles.notice}>Closed Beta: ชำระเงินและมัดจำกับสนามนอกระบบ การยืนยันจองไม่ใช่หลักฐานชำระเงิน กรุณาตกลงยอดเงินและเงื่อนไขคืนเงินกับสนามก่อนโอน</p>
}

const local = (value: string) => new Date(new Date(value).valueOf() + 7 * 3600000).toISOString().slice(0,16)

export default function VenueOperations({ venues, bookings }: { venues: OwnerVenue[]; bookings: OwnerBooking[] }) {
  const router = useRouter()
  const lock = useRef(false)
  // The ref refuses the next submit synchronously; the state is what re-renders the
  // save button as disabled, so the lock never depends on the feedback setState.
  const outcomeUnknown = useRef(false)
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState('')
  const [needsReload, setNeedsReload] = useState(false)
  const [day, setDay] = useState('')
  const courts = venues.flatMap(v => (v.venue_courts ?? []).map(c => ({ ...c, venueName: v.name })))
  const slots = courts.flatMap(c => (c.venue_slots ?? []).map(s => ({ ...s, label: `${c.venueName} · ${c.name}` })))
    .sort((a,b) => a.starts_at.localeCompare(b.starts_at))
  async function submit(event: FormEvent<HTMLFormElement>, action: string, id: string) {
    event.preventDefault()
    if (lock.current || outcomeUnknown.current) return
    lock.current = true; setBusy(true); setFeedback('')
    const data = Object.fromEntries(new FormData(event.currentTarget))
    try {
      const result = await requestJson('/api/venue-management', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id, data }) })
      if (!result.ok) {
        if (result.kind === 'network') { outcomeUnknown.current = true; setNeedsReload(true) }
        setFeedback(requestErrorText(result, { fallback: 'บันทึกไม่สำเร็จ', mutating: true }))
      } else { setFeedback('บันทึกแล้ว'); router.refresh() }
    } catch { setFeedback('บันทึกไม่สำเร็จ') }
    finally { lock.current = false; setBusy(false) }
  }
  const save = <button disabled={busy || needsReload} aria-busy={busy}>{busy ? 'กำลังบันทึก…' : 'บันทึก'}</button>
  return <section className={styles.panel}>
    <p className={styles.eyebrow}>VENUE DESK · เวลาประเทศไทย</p>
    <h2>ตารางสนามและการจัดการ</h2>
    <OfflinePaymentNotice />
    <p role="status" aria-live="polite">{feedback}</p>
    {needsReload && <button type="button" onClick={() => window.location.reload()}>โหลดหน้าใหม่เพื่อตรวจสถานะก่อนบันทึกอีกครั้ง</button>}
    <label>เลือกวัน <input type="date" value={day} onChange={e => setDay(e.target.value)} /></label>
    <div className={styles.calendar}>
      {slots.filter(s => day && local(s.starts_at).startsWith(day)).map(s => <article key={s.id}>
        <strong>{s.label}</strong><p>{formatVenueBookingTime(s.starts_at)}–{formatVenueBookingTime(s.ends_at)}</p>
        <p>฿{s.price_baht} · {s.status === 'open' ? 'ว่าง' : s.status === 'reserved' ? 'มีคำขอ/จองแล้ว' : 'ปิด'}</p>
        {s.status === 'open' && <details><summary>แก้ไขเวลา/ราคา (เฉพาะเวลาอนาคต)</summary>
          <form onSubmit={e => void submit(e,'slot',s.id)}>
            <label>เริ่ม<input required type="datetime-local" name="startsAt" defaultValue={local(s.starts_at)} /></label>
            <label>สิ้นสุด<input required type="datetime-local" name="endsAt" defaultValue={local(s.ends_at)} /></label>
            <label>ราคา<input required type="number" name="priceBaht" min="0" max="100000" defaultValue={s.price_baht} /></label>{save}
          </form></details>}
      </article>)}
      {!day && <p>เลือกวันเพื่อดูทุกคอร์ท พร้อมสถานะว่างและการจอง</p>}
      {day && !slots.some(s => local(s.starts_at).startsWith(day)) && <p>ไม่มีช่วงเวลาในวันนี้</p>}
    </div>
    {venues.map(v => <details key={v.id}><summary>แก้ข้อมูลสนาม · {v.name}</summary>
      <form onSubmit={e => void submit(e,'venue',v.id)}>
        <label>ชื่อสนาม<input required name="name" minLength={2} maxLength={120} defaultValue={v.name} /></label>
        <label>จังหวัด<input required name="province" minLength={2} maxLength={100} defaultValue={v.province} /></label>
        <label>ที่อยู่<input required name="address" minLength={5} maxLength={500} defaultValue={v.address} /></label>
        <label>เบอร์ติดต่อสนาม (สาธารณะ)<input required name="contactPhone" minLength={6} maxLength={30} defaultValue={v.contact_phone} /></label>
        <label>รายละเอียด<textarea name="description" maxLength={1200} defaultValue={v.description} /></label>{save}
      </form></details>)}
    {courts.map(c => <details key={c.id}><summary>{c.venueName} · {c.name} — จัดการคอร์ท/เปิดเวลารายสัปดาห์</summary>
      <form onSubmit={e => void submit(e,'court',c.id)}>
        <label>ชื่อคอร์ท<input required name="name" maxLength={100} defaultValue={c.name} /></label>
        <label>กีฬา<select name="sport" defaultValue={c.sport}><option value="football">ฟุตบอล</option><option value="futsal">ฟุตซอล</option></select></label>
        <label>พื้นสนาม<input name="surface" maxLength={80} defaultValue={c.surface} /></label>
        <label>จำนวนผู้เล่น<input type="number" min="1" max="200" name="capacity" defaultValue={c.capacity ?? ''} /></label>{save}
      </form>
      <h3>เปิดช่วงเวลาเดิมทุกสัปดาห์</h3><p>สร้างล่วงหน้าได้ 1–12 สัปดาห์ ถ้ามีเวลาทับซ้อนจะไม่บันทึกทั้งชุด</p>
      <form onSubmit={e => void submit(e,'bulk_slots',c.id)}>
        <label>เริ่มครั้งแรก<input required type="datetime-local" name="startsAt" /></label>
        <label>สิ้นสุดครั้งแรก<input required type="datetime-local" name="endsAt" /></label>
        <label>ราคา/ครั้ง<input required type="number" name="priceBaht" min="0" max="100000" /></label>
        <label>จำนวนสัปดาห์<input required type="number" name="weeks" min="1" max="12" defaultValue={1} /></label>{save}
      </form></details>)}
    <h3>ประสานงานการจอง</h3><p>ข้อเสนอเลื่อนหรือยกเลิกหลังยืนยันต้องได้รับคำตอบจากอีกฝ่าย การจองเดิมยังคงอยู่ระหว่างรอ</p>
    {bookings.map(b => <p key={b.id}><Link href={`/venues/bookings/${b.id}`}>{b.venue_slots?.venue_courts?.name} · {b.venue_slots ? formatVenueBookingDateTime(b.venue_slots.starts_at) : b.purpose} → เปิดรายละเอียด/ข้อความ</Link></p>)}
  </section>
}
