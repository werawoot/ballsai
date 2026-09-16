import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, MapPin, Phone } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import BookingRequestClient, { type AvailableSlot } from '../BookingRequestClient'
import VenueGallery from './VenueGallery'
import { venueCardStats } from '@/lib/venue-card-stats'

type SlotRow = AvailableSlot & { status: string }
type Venue = { id: string; name: string; province: string; address: string; contact_phone: string; description: string; amenities: string[]; venue_courts: { id: string; name: string; sport: string; surface: string; capacity: number | null; venue_slots: SlotRow[] | null }[] | null }

export default async function VenueDetailPage({ params }: { params: { id: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('venue_profiles').select('id, name, province, address, contact_phone, description, amenities, venue_courts(id, name, sport, surface, capacity, venue_slots(id, starts_at, ends_at, price_baht, status))').eq('id', params.id).eq('is_published', true).maybeSingle()
  if (!data) notFound()
  const venue = data as unknown as Venue
  const stats = venueCardStats(venue.venue_courts)
  const slots = (venue.venue_courts ?? []).flatMap(court => (court.venue_slots ?? []).filter(slot => slot.status === 'open' && new Date(slot.starts_at) > new Date()).map(slot => ({ ...slot, venue_courts: { name: court.name, sport: court.sport } }))).sort((a, b) => a.starts_at.localeCompare(b.starts_at))

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}>
    <header style={{ background: '#101827', color: 'white', padding: '13px 18px' }}><Link href="/venues" style={{ color: '#f5c518', textDecoration: 'none', fontSize: 12, fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: 5 }}><ArrowLeft size={15} /> กลับไปดูสนามทั้งหมด</Link></header>
    <section style={{ background: '#101827', color: '#fff', borderBottom: '1px solid #1f2a3d' }}>
      {/* The gallery sits above the fold but never over the booking panel, which keeps
          its own column on desktop and follows the venue facts on mobile. */}
      <VenueGallery venueName={venue.name} photos={null} />
      <div style={{ maxWidth: 880, margin: '0 auto', padding: '20px 18px 26px' }}>
        <p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.4 }}>VENUE · {venue.province}</p>
        <h1 style={{ margin: '6px 0 8px', font: '800 clamp(30px,6.5vw,50px)/.98 var(--font-oswald)' }}>{venue.name}</h1>
        <p style={{ maxWidth: 620, margin: 0, color: 'rgba(255,255,255,.66)', fontSize: 14, lineHeight: 1.6 }}>{venue.description || 'สนามพร้อมให้ส่งคำขอจองผ่าน BallDoenSai'}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 15 }}>
          {stats.sports.map(sport => <span key={sport} style={{ borderRadius: 999, background: 'rgba(245,197,24,.14)', color: '#f5c518', padding: '5px 11px', fontSize: 11, fontWeight: 800 }}>{sport}</span>)}
          <span style={{ borderRadius: 999, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.8)', padding: '5px 11px', fontSize: 11, fontWeight: 800 }}>{stats.courtCount} พื้นที่เล่น</span>
          <span style={{ borderRadius: 999, background: stats.openSlotCount > 0 ? 'rgba(204,0,1,.9)' : 'rgba(255,255,255,.08)', color: stats.openSlotCount > 0 ? '#fff' : 'rgba(255,255,255,.6)', padding: '5px 11px', fontSize: 11, fontWeight: 800 }}>{stats.openSlotCount > 0 ? `ว่าง ${stats.openSlotCount} ช่วงเวลา` : 'ยังไม่มีเวลาว่าง'}</span>
          {stats.priceLabel && <span style={{ borderRadius: 999, background: 'rgba(255,255,255,.08)', color: '#f5c518', padding: '5px 11px', fontSize: 11, fontWeight: 900 }}>{stats.priceLabel}</span>}
        </div>
      </div>
    </section>
    <section style={{ maxWidth: 880, margin: '0 auto', padding: '22px 16px', display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))' }}><div style={{ display: 'grid', gap: 12 }}><article style={{ background: '#fff', border: '1px solid #e2e5e9', borderRadius: 14, padding: 16 }}><h2 style={{ margin: 0, fontSize: 18 }}>ข้อมูลสนาม</h2><p style={{ display: 'flex', alignItems: 'flex-start', gap: 7, color: '#596574', fontSize: 13, lineHeight: 1.5 }}><MapPin size={16} color="#cc0001" /> {venue.address}, {venue.province}</p><p style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#596574', fontSize: 13 }}><Phone size={16} color="#cc0001" /> {venue.contact_phone}</p>{venue.amenities.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{venue.amenities.map(item => <span key={item} style={{ background: '#f7f7f5', borderRadius: 20, padding: '5px 8px', fontSize: 11, fontWeight: 700 }}>{item}</span>)}</div>}</article><article style={{ background: '#fff', border: '1px solid #e2e5e9', borderRadius: 14, padding: 16 }}><h2 style={{ margin: 0, fontSize: 18 }}>พื้นที่เล่น</h2><div style={{ display: 'grid', gap: 8, marginTop: 12 }}>{(venue.venue_courts ?? []).length ? venue.venue_courts?.map(court => <div key={court.id} style={{ background: '#f7f7f5', borderRadius: 10, padding: 11 }}><b>{court.name}</b><p style={{ color: '#687586', fontSize: 12, margin: '4px 0 0' }}>{court.sport === 'futsal' ? 'ฟุตซอล' : 'ฟุตบอล'}{court.surface ? ` · ${court.surface}` : ''}{court.capacity ? ` · รองรับ ${court.capacity} คน` : ''}</p></div>) : <p style={{ color: '#687586', fontSize: 13 }}>กำลังเพิ่มพื้นที่เล่น</p>}</div></article></div><BookingRequestClient slots={slots} /></section>
  </main>
}
