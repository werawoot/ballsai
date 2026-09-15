import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CalendarDays } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import {
  isMissingBookingSnapshotError,
  toVenueBookingHistoryItem,
  VENUE_BOOKING_LEGACY_SELECT,
  VENUE_BOOKING_SNAPSHOT_SELECT,
  type VenueBookingHistoryRow,
  type VenueBookingStatus,
} from '@/lib/venue-booking-history'

const label: Record<VenueBookingStatus, string> = { pending: 'รอตอบรับ', confirmed: 'ยืนยันแล้ว', declined: 'ปฏิเสธ', cancelled: 'ยกเลิก' }

export default async function MyVenueBookingsPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/venues/bookings')
  const snapshotResult = await supabase.from('venue_booking_requests').select(VENUE_BOOKING_SNAPSHOT_SELECT).eq('requester_id', user.id).order('requested_at', { ascending: false })
  let bookingRows = snapshotResult.data as unknown as VenueBookingHistoryRow[] | null
  if (isMissingBookingSnapshotError(snapshotResult.error)) {
    const legacyResult = await supabase.from('venue_booking_requests').select(VENUE_BOOKING_LEGACY_SELECT).eq('requester_id', user.id).order('requested_at', { ascending: false })
    bookingRows = legacyResult.data as unknown as VenueBookingHistoryRow[] | null
  }
  const bookings = (bookingRows ?? []).map(toVenueBookingHistoryItem)
  const format = (value: string) => new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}><header style={{ background: '#101827', color: 'white', padding: '13px 18px', display: 'flex', justifyContent: 'space-between' }}><Link href="/" style={{ color: 'white', textDecoration: 'none', fontWeight: 900 }}>BALLDOENSAI.COM</Link><Link href="/venues" style={{ color: '#f5c518', textDecoration: 'none', fontSize: 12, fontWeight: 800 }}>หาสนาม</Link></header><section style={{ maxWidth: 720, margin: '0 auto', padding: '28px 16px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}><CalendarDays size={25} color="#cc0001" /><div><p style={{ margin: 0, color: '#cc0001', font: '800 10px var(--font-oswald)', letterSpacing: 1.4 }}>MY REQUESTS</p><h1 style={{ margin: 0, fontSize: 30 }}>คำขอจองสนาม</h1></div></div>{bookings.length === 0 ? <div style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 14, padding: 26, textAlign: 'center' }}><p style={{ color: '#687586' }}>ยังไม่มีคำขอจอง</p><Link href="/venues" style={{ color: '#cc0001', fontWeight: 900, textDecoration: 'none' }}>เลือกสนาม →</Link></div> : <div style={{ display: 'grid', gap: 10 }}>{bookings.map(booking => <article key={booking.id} style={{ background: '#fff', border: '1px solid #e3e6ea', borderRadius: 12, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><div><b>{booking.venueName}</b><p style={{ color: '#687586', fontSize: 12, margin: '4px 0' }}>{booking.courtName}{booking.startsAt ? ` · ${format(booking.startsAt)}` : ''}</p><p style={{ margin: 0, fontSize: 13 }}>{booking.purpose}</p></div><span style={{ height: 'fit-content', borderRadius: 20, background: booking.status === 'confirmed' ? '#dcfce7' : booking.status === 'pending' ? '#fff3c7' : '#e5e7eb', color: booking.status === 'confirmed' ? '#166534' : '#5f4800', padding: '4px 8px', fontSize: 10, fontWeight: 900 }}>{label[booking.status]}</span></div></article>)}</div>}</section></main>
}
