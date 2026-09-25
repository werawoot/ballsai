import Link from 'next/link'
import { CalendarClock, ChevronRight, LayoutGrid, MapPin } from 'lucide-react'
import VenuePitchCover from '@/components/VenuePitchCover'
import { venueCardStats, type VenueCardCourt } from '@/lib/venue-card-stats'

export type VenueCardVenue = {
  id: string
  name: string
  province: string
  description: string
  venue_courts: VenueCardCourt[] | null
}

// Venue photos are not in the schema yet, so the cover is always the drawn pitch. When a
// migration adds them this is the one place that has to start passing them through.
export default function VenueCard({ venue, now }: { venue: VenueCardVenue; now?: Date }) {
  const stats = venueCardStats(venue.venue_courts, now)
  return <Link key={venue.id} href={`/venues/${venue.id}`} aria-label={`ดูรายละเอียดสนาม ${venue.name} จังหวัด${venue.province}`} style={{ background: '#101827', border: '1px solid #1f2a3d', borderRadius: 16, overflow: 'hidden', color: '#fff', textDecoration: 'none', display: 'flex', flexDirection: 'column' }}>
        <div style={{ position: 'relative' }}>
          <VenuePitchCover height={152} />
          <span style={{ position: 'absolute', top: 11, left: 11, display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 999, background: 'rgba(204,0,1,.92)', color: '#fff', padding: '4px 9px', fontSize: 10, fontWeight: 900 }}><MapPin size={11} /> {venue.province}</span>
          {stats.openSlotCount > 0
            ? <span style={{ position: 'absolute', top: 11, right: 11, borderRadius: 999, background: '#f5c518', color: '#101827', padding: '4px 9px', fontSize: 10, fontWeight: 900 }}>ว่าง {stats.openSlotCount} ช่วง</span>
            : <span style={{ position: 'absolute', top: 11, right: 11, borderRadius: 999, background: 'rgba(16,24,39,.82)', color: 'rgba(255,255,255,.72)', padding: '4px 9px', fontSize: 10, fontWeight: 900 }}>ยังไม่มีเวลาว่าง</span>}
        </div>
        <div style={{ padding: '14px 15px 15px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
          <h2 style={{ margin: 0, font: '800 19px/1.2 var(--font-oswald)', letterSpacing: .2 }}>{venue.name}</h2>
          {venue.description && <p style={{ margin: 0, color: 'rgba(255,255,255,.62)', fontSize: 12, lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{venue.description}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {stats.sports.map(sport => <span key={sport} style={{ borderRadius: 6, background: 'rgba(245,197,24,.14)', color: '#f5c518', padding: '3px 7px', fontSize: 10, fontWeight: 800 }}>{sport}</span>)}
          </div>
          <div style={{ marginTop: 'auto', paddingTop: 10, borderTop: '1px solid #1f2a3d', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 11, color: 'rgba(255,255,255,.66)', fontSize: 11, fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><LayoutGrid size={13} /> {stats.courtCount} พื้นที่เล่น</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CalendarClock size={13} /> {stats.openSlotCount} ช่วงเวลา</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: stats.priceLabel ? '#f5c518' : 'rgba(255,255,255,.5)', fontSize: 13, fontWeight: 900 }}>{stats.priceLabel ?? 'ยังไม่ระบุราคา'} <ChevronRight size={15} /></span>
          </div>
        </div>
      </Link>
}
