'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { X } from 'lucide-react'
import {
  CANCEL_CONFIRM_MESSAGE,
  canCancelBooking,
  cancelResultFeedback,
  type CancelFeedback,
} from '@/lib/venue-booking-cancel'
import type { VenueBookingHistoryItem, VenueBookingStatus } from '@/lib/venue-booking-history'

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
  const format = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))

  const cancel = async (bookingId: string) => {
    if (busy) return
    if (!window.confirm(CANCEL_CONFIRM_MESSAGE)) return
    setBusy(bookingId); setFeedback(null)
    const response = await fetch(`/api/venue-bookings/${bookingId}`, { method: 'DELETE' }).catch(() => null)
    const body = response ? await response.json().catch(() => null) as { error?: string } | null : null
    setBusy(null)
    const result = cancelResultFeedback(response ? { ok: response.ok, status: response.status, error: body?.error } : null)
    setFeedback(result)
    if (result.shouldRefresh) router.refresh()
  }

  return <div style={{ display: 'grid', gap: 10 }}>
    {feedback && <p role="status" aria-live="polite" style={{ margin: 0, padding: '10px 12px', borderRadius: 9, background: feedback.tone === 'error' ? '#fff1f1' : '#ecfdf5', color: feedback.tone === 'error' ? '#b91c1c' : '#166534', fontSize: 13, fontWeight: 700 }}>{feedback.text}</p>}
    {bookings.map(booking => <article key={booking.id} style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 12, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 0, flex: '1 1 200px' }}>
          <b>{booking.venueName}</b>
          <p style={{ color: '#687586', fontSize: 12, margin: '4px 0' }}>{booking.courtName}{booking.startsAt ? ` · ${format(booking.startsAt)}` : ''}</p>
          <p style={{ margin: 0, fontSize: 13 }}>{booking.purpose}</p>
        </div>
        <span style={badgeStyle(booking.status)}>{label[booking.status]}</span>
      </div>
      {canCancelBooking(booking.status) && <button
        type="button"
        aria-busy={busy === booking.id}
        disabled={busy !== null}
        onClick={() => void cancel(booking.id)}
        aria-label={`ยกเลิกคำขอจอง ${booking.venueName} ${booking.courtName}`}
        style={{ marginTop: 11, display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #fecaca', borderRadius: 8, background: '#fff', color: '#b91c1c', padding: '8px 11px', fontWeight: 900, fontSize: 12, cursor: busy ? 'wait' : 'pointer' }}
      ><X size={14} /> {busy === booking.id ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอ'}</button>}
    </article>)}
  </div>
}
