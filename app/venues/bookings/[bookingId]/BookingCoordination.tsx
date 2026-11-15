'use client'
import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { OfflinePaymentNotice } from '@/app/venue/VenueOperations'
import { formatVenueBookingDateTime } from '@/lib/venue-booking-time'
import styles from '@/app/venue/operations.module.css'
export type AvailableSlot = { id: string; name: string; starts_at: string; ends_at: string; price_baht: number }
export type CoordinationRow = { id: string; actor_id: string; kind: string; body: string; status: string; created_at: string; target_snapshot: AvailableSlot | null }
export default function BookingCoordination({ bookingId, status, userId, rows, slots }: { bookingId: string; status: string; userId: string; rows: CoordinationRow[]; slots: AvailableSlot[] }) {
  const router = useRouter(); const lock = useRef(false)
  const [busy,setBusy] = useState(false); const [feedback,setFeedback] = useState('')
  async function send(action: string,data: Record<string,unknown>) {
    if(lock.current) return
    lock.current=true;setBusy(true)
    try {
      const response=await fetch('/api/venue-coordination',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:bookingId,data})})
      const result=await response.json();setFeedback(response.ok?'บันทึกแล้ว':result.error)
      if(response.ok)router.refresh()
    } catch {setFeedback('เชื่อมต่อไม่สำเร็จ กรุณาลองใหม่')} finally{lock.current=false;setBusy(false)}
  }
  function submit(event:FormEvent<HTMLFormElement>,action:string){event.preventDefault();void send(action,Object.fromEntries(new FormData(event.currentTarget)))}
  return <section className={styles.panel}><OfflinePaymentNotice /><h2>ประสานงานกับคู่จอง</h2>
    <p>ข้อความเห็นเฉพาะคู่จอง ไม่แสดงเบอร์โทรหรืออีเมลบัญชี กรุณาไม่ส่งข้อมูลส่วนตัวของนักกีฬา</p>
    <p role="status" aria-live="polite">{feedback}</p>
    {rows.map(row=><article key={row.id}><p><b>{row.actor_id===userId?'คุณ':'คู่จอง'}</b> · {formatVenueBookingDateTime(row.created_at)}</p><p>{row.body}</p>
      {row.kind!=='message'&&<><p>{row.kind==='propose_cancel'?'ขอยกเลิกการจอง':'ขอเลื่อนการจอง'} · {row.status==='pending'?'รอตอบรับ':row.status==='accepted'?'ตกลงแล้ว':'ไม่ตกลง'}</p>
        {row.target_snapshot&&<p>เวลาใหม่ {formatVenueBookingDateTime(row.target_snapshot.starts_at)} · ราคาใหม่ ฿{row.target_snapshot.price_baht}</p>}
        {status==='confirmed'&&row.status==='pending'&&row.actor_id!==userId&&<div><button disabled={busy} onClick={()=>void send('accept',{proposalId:row.id})}>{busy?'กำลังบันทึก…':'ตกลงตามข้อเสนอ'}</button> <button disabled={busy} onClick={()=>void send('reject',{proposalId:row.id})}>ไม่ตกลง</button></div>}</>}
    </article>)}
    {['pending','confirmed'].includes(status)&&<form onSubmit={e=>submit(e,'message')}><label>ข้อความ<textarea required minLength={3} maxLength={600} name="text" /></label><button disabled={busy} aria-busy={busy}>{busy?'กำลังส่ง…':'ส่งข้อความ'}</button></form>}
    {status==='confirmed'&&!rows.some(r=>r.kind!=='message'&&r.status==='pending')&&<>
      <p>การจองเดิมยังคงอยู่จนกว่าอีกฝ่ายจะตอบรับ เวลาใหม่ยังไม่ถูกกันไว้ หากมีผู้อื่นจองก่อน ต้องเลือกใหม่ การคืนเงินต้องตกลงกันนอกระบบ</p>
      <form onSubmit={e=>submit(e,'propose_move')}><label>เวลาใหม่<select required name="slotId"><option value="">เลือกช่วงเวลา</option>{slots.map(s=><option key={s.id} value={s.id}>{s.name} · {formatVenueBookingDateTime(s.starts_at)} · ฿{s.price_baht}</option>)}</select></label><label>เหตุผล<textarea required minLength={3} maxLength={600} name="reason" /></label><button disabled={busy||!slots.length}>เสนอเลื่อน</button></form>
      <form onSubmit={e=>submit(e,'propose_cancel')}><label>เหตุผลขอยกเลิก<textarea required minLength={3} maxLength={600} name="reason" /></label><button disabled={busy}>เสนอขอยกเลิก</button></form>
    </>}
  </section>
}
