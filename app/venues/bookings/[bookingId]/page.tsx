import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import BookingCoordination, { type CoordinationRow, type AvailableSlot } from './BookingCoordination'
import { formatVenueBookingDateTime } from '@/lib/venue-booking-time'

export default async function BookingDetails({ params }: { params: { bookingId: string } }) {
  if (!/^[0-9a-f-]{36}$/i.test(params.bookingId)) notFound()
  const db = await createServerSupabaseClient()
  const { data: { user } } = await db.auth.getUser()
  if (!user) redirect(`/login?next=/venues/bookings/${params.bookingId}`)
  const { data: booking } = await db.from('venue_booking_requests').select('id,status,venue_name_snapshot,court_name_snapshot,slot_starts_at_snapshot,price_baht_snapshot').eq('id',params.bookingId).maybeSingle()
  if (!booking) notFound()
  const [{ data: rows, error }, { data: slots, error: optionsError }] = await Promise.all([
    db.from('venue_booking_coordination').select('id,actor_id,kind,body,status,target_snapshot,created_at').eq('booking_id',booking.id).order('created_at'),
    db.rpc('venue_booking_options_beta',{ p_id: booking.id }),
  ])
  return <main style={{ maxWidth: 850, margin: 'auto', padding: '32px 16px' }}>
    <Link href="/venues/bookings">← คำขอของฉัน</Link> · <Link href="/venue">จัดการสนาม</Link>
    <h1>{booking.venue_name_snapshot} · {booking.court_name_snapshot}</h1>
    <p>{formatVenueBookingDateTime(booking.slot_starts_at_snapshot)} · ฿{booking.price_baht_snapshot}</p>
    {error || optionsError ? <p role="alert">ยังเปิดการประสานงานไม่ได้ กรุณาติดต่อทีมงาน</p> : <BookingCoordination bookingId={booking.id} status={booking.status} userId={user.id} rows={(rows ?? []) as CoordinationRow[]} slots={(slots ?? []) as AvailableSlot[]} />}
  </main>
}
