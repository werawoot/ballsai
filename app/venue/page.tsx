import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import VenueOwnerClient, { type OwnerBooking, type OwnerVenue } from './VenueOwnerClient'

export default async function VenueOwnerPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/venue')

  const [{ data: venueRows }, { data: bookingRows }] = await Promise.all([
    supabase.from('venue_profiles').select('id, name, province, address, contact_phone, description, amenities, venue_courts(id, name, sport, surface, capacity, venue_slots(id, starts_at, ends_at, price_baht, status))').eq('owner_id', user.id).order('created_at', { ascending: false }),
    // Inner joins keep this to requests against the viewer's own venues. RLS also lets
    // an owner read their own outgoing requests to other venues; those are not inbox items.
    supabase.from('venue_booking_requests').select('id, status, purpose, note, requested_at, venue_slots!inner(starts_at, ends_at, price_baht, venue_courts!inner(name, venue_profiles!inner(name, owner_id)))').eq('venue_slots.venue_courts.venue_profiles.owner_id', user.id).order('requested_at', { ascending: false }).limit(50),
  ])

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}>
    <header style={{ background: '#101827', color: 'white', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Link href="/" style={{ color: 'white', textDecoration: 'none', font: '800 22px var(--font-oswald)' }}>BALLDOENSAI<span style={{ color: '#f5c518' }}>.COM</span></Link><Link href="/venues" style={{ color: '#f5c518', textDecoration: 'none', fontSize: 12, fontWeight: 800, display: 'flex', gap: 4, alignItems: 'center' }}><ChevronLeft size={15} /> ดูสนามทั้งหมด</Link></header>
    <section style={{ background: 'linear-gradient(120deg,#172033,#0f503d)', color: 'white', padding: '34px 18px 38px' }}><div style={{ maxWidth: 880, margin: '0 auto' }}><p style={{ color: '#f5c518', margin: 0, font: '800 10px var(--font-oswald)', letterSpacing: 1.5 }}>VENUE OWNER · CLOSED BETA</p><h1 style={{ margin: '9px 0 7px', font: '800 clamp(35px,7vw,54px)/.93 var(--font-oswald)' }}>จัดการสนาม<br /><span style={{ color: '#f5c518' }}>ให้พร้อมลงเล่น</span></h1><p style={{ maxWidth: 560, margin: 0, color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55 }}>สร้างสนาม เปิดช่วงเวลาว่าง และตอบรับคำขอจองจากผู้ใช้ BallDoenSai ในที่เดียว</p></div></section>
    <section style={{ maxWidth: 880, margin: '0 auto', padding: '22px 16px' }}><VenueOwnerClient venues={(venueRows ?? []) as unknown as OwnerVenue[]} bookings={(bookingRows ?? []) as unknown as OwnerBooking[]} /></section>
  </main>
}
