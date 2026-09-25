'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { X } from 'lucide-react'
import {
  CANCEL_CONFIRM_MESSAGE,
  canCancelBooking,
  cancelResultFeedback,
  type CancelFeedback,
} from '@/lib/venue-booking-cancel'
import type { VenueBookingHistoryItem, VenueBookingStatus } from '@/lib/venue-booking-history'
import { requestErrorText, requestJson } from '@/lib/pending-action'

const label: Record<VenueBookingStatus, string> = { pending: 'รอตอบรับ', confirmed: 'ยืนยันแล้ว', declined: 'ปฏิเสธ', cancelled: 'ยกเลิก' }

const badgeStyle = (status: VenueBookingStatus) => ({
  height: 'fit-content',
  borderRadius: 20,
  background: status === 'confirmed' ? '#dcfce7' : status === 'pending' ? '#fff3c7' : '#e5e7eb',
  color: status === 'confirmed' ? '#166534' : status === 'pending' ? '#5f4800' : '#4b5563',
  padding: '4px 8px',
  fontSize: 10,
  fontWeight: 900,
  flex: '0 0 auto',
})

export default function BookingHistoryList({ bookings }: { bookings: VenueBookingHistoryItem[] }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<CancelFeedback | null>(null)
  // The ref refuses the next click synchronously; the state is what re-renders the
  // control as disabled, so the lock never depends on some other setState.
  const outcomeUnknown = useRef(false)
  const [needsReload, setNeedsReload] = useState(false)
  const format = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const cancel = async (bookingId: string) => {
    if (busy || outcomeUnknown.current) return
    if (!window.confirm(CANCEL_CONFIRM_MESSAGE)) return
    setBusy(bookingId); setFeedback(null)
    try {
      const outcome = await requestJson(`/api/venue-bookings/${bookingId}`, { method: 'DELETE' })
      if (!outcome.ok) {
        if (outcome.kind === 'network') {
          outcomeUnknown.current = true; setNeedsReload(true)
          setFeedback({ tone: 'error', text: requestErrorText(outcome, { fallback: 'ส่งคำขอยกเลิกไม่สำเร็จ', mutating: true }), shouldRefresh: false })
          return
        }
        const result = cancelResultFeedback({ ok: false, status: outcome.status, error: outcome.error ?? undefined })
        setFeedback(result)
        if (result.shouldRefresh) router.refresh()
        return
      }
      const result = cancelResultFeedback({ ok: true, status: 200 })
      setFeedback(result)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return <div style={{ display: 'grid', gap: 10 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '10px 12px', borderRadius: 9, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 13, fontWeight: 700 }}>{feedback.text}</p>}
    {needsReload && <button type="button" onClick={() => window.location.reload()} style={{ padding: '10px 12px', fontSize: 12, border: 0, borderRadius: 8, background: '#111', color: 'white', fontWeight: 800, cursor: 'pointer' }}>โหลดหน้าใหม่เพื่อตรวจสถานะคำขอก่อนลองอีกครั้ง</button>}
    {bookings.map(booking => <article key={booking.id} style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <b>{booking.venueName}</b>
          <p style={{ color: '#687586', fontSize: 12, margin: '4px 0' }}>{booking.courtName}{booking.startsAt ? ` · ${format(booking.startsAt)}` : ''}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{booking.purpose}</p>
        </div>
        <span style={badgeStyle(booking.status)}>{label[booking.status]}</span>
      </div>
      <p><Link href={`/venues/bookings/${booking.id}`}>รายละเอียด / ประสานงาน / ขอเปลี่ยนการจอง</Link></p>
      {canCancelBooking(booking.status) && <button
        type="button"
        aria-busy={busy === booking.id}
        disabled={busy !== null || needsReload}
        onClick={() => void cancel(booking.id)}
        aria-label={`ยกเลิกคำขอจอง ${booking.venueName} ${booking.courtName}`}
        style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', padding: '8px 11px', fontWeight: 900, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}
      ><X size={14} /> {busy === booking.id ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอ'}</button>}
    </article>)}
  </div>
}
