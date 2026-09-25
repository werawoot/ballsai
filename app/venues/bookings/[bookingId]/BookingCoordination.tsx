'use client'
import { useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { OfflinePaymentNotice } from '@/app/venue/VenueOperations'
import { formatVenueBookingDateTime } from '@/lib/venue-booking-time'
import styles from '@/app/venue/operations.module.css'
import { requestJson, requestErrorText } from '@/lib/pending-action'
export type AvailableSlot = { id: string; name: string; starts_at: string; ends_at: string; price_baht: number }
export type CoordinationRow = { id: string; actor_id: string; kind: string; body: string; status: string; created_at: string; target_snapshot: AvailableSlot | null }
export default function BookingCoordination({ bookingId, status, userId, rows, slots }: { bookingId: string; status: string; userId: string; rows: CoordinationRow[]; slots: AvailableSlot[] }) {
  const router = useRouter(); const lock = useRef(false)
  // The ref refuses the next click synchronously; the state is what makes every button
  // render as disabled, so no control is left looking pressable while `send` returns early.
  const outcomeUnknown = useRef(false)
  const [busy,setBusy] = useState(false); const [feedback,setFeedback] = useState(''); const [needsReload,setNeedsReload] = useState(false)
  async function send(action: string,data: Record<string,unknown>) {
    if(lock.current || outcomeUnknown.current) return
    lock.current=true;setBusy(true)
    try {
      const result=await requestJson('/api/venue-coordination',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,id:bookingId,data})})
      if(!result.ok){if(result.kind==='network'){outcomeUnknown.current=true;setNeedsReload(true)}setFeedback(requestErrorText(result,{fallback:'บันทึกไม่สำเร็จ',mutating:true}))}
      else {setFeedback('บันทึกแล้ว');router.refresh()}
    } finally{lock.current=false;setBusy(false)}
  }
  function submit(event:FormEvent<HTMLFormElement>,action:string){event.preventDefault();void send(action,Object.fromEntries(new FormData(event.currentTarget)))}
  return <section className={styles.panel}><OfflinePaymentNotice /><h2>ประสานงานกับคู่จอง</h2>
    <p>ข้อความเห็นเฉพาะคู่จอง ไม่แสดงเบอร์โทรหรืออีเมลบัญชี กรุณาไม่ส่งข้อมูลส่วนตัวของนักกีฬา</p>
    <p role="status" aria-live="polite">{feedback}</p>
    {needsReload&&<button type="button" onClick={()=>window.location.reload()}>โหลดหน้าใหม่เพื่อตรวจสถานะก่อนส่งอีกครั้ง</button>}
    {rows.map(row=><article key={row.id}><p><b>{row.actor_id===userId?'คุณ':'คู่จอง'}</b> · {formatVenueBookingDateTime(row.created_at)}</p><p>{row.body}</p>
      {row.kind!=='message'&&<><p>{row.kind==='propose_cancel'?'ขอยกเลิกการจอง':'ขอเลื่อนการจอง'} · {row.status==='pending'?'รอตอบรับ':row.status==='accepted'?'ตกลงแล้ว':'ไม่ตกลง'}</p>
        {row.target_snapshot&&<p>เวลาใหม่ {formatVenueBookingDateTime(row.target_snapshot.starts_at)} · ราคาใหม่ ฿{row.target_snapshot.price_baht}</p>}
        {status==='confirmed'&&row.status==='pending'&&row.actor_id!==userId&&<div><button disabled={busy||needsReload} onClick={()=>void send('accept',{proposalId:row.id})}>{busy?'กำลังบันทึก…':'ตกลงตามข้อเสนอ'}</button> <button disabled={busy||needsReload} onClick={()=>void send('reject',{proposalId:row.id})}>ไม่ตกลง</button></div>}</>}
    </article>)}
    {['pending','confirmed'].includes(status)&&<form onSubmit={e=>submit(e,'message')}><label>ข้อความ<textarea required minLength={3} maxLength={600} name="text" /></label><button disabled={busy||needsReload} aria-busy={busy}>{busy?'กำลังส่ง…':'ส่งข้อความ'}</button></form>}
    {status==='confirmed'&&!rows.some(r=>r.kind!=='message'&&r.status==='pending')&&<>
      <p>การจองเดิมยังคงอยู่จนกว่าอีกฝ่ายจะตอบรับ เวลาใหม่ยังไม่ถูกกันไว้ หากมีผู้อื่นจองก่อน ต้องเลือกใหม่ การคืนเงินต้องตกลงกันนอกระบบ</p>
      <form onSubmit={e=>submit(e,'propose_move')}><label>เวลาใหม่<select required name="slotId"><option value="">เลือกช่วงเวลา</option>{slots.map(s=><option key={s.id} value={s.id}>{s.name} · {formatVenueBookingDateTime(s.starts_at)} · ฿{s.price_baht}</option>)}</select></label><label>เหตุผล<textarea required minLength={3} maxLength={600} name="reason" /></label><button disabled={busy||needsReload||!slots.length}>เสนอเลื่อน</button></form>
      <form onSubmit={e=>submit(e,'propose_cancel')}><label>เหตุผลขอยกเลิก<textarea required minLength={3} maxLength={600} name="reason" /></label><button disabled={busy||needsReload}>เสนอขอยกเลิก</button></form>
    </>}
  </section>
}
