import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import VenueCard from '@/components/VenueCard'

type Venue = { id: string; name: string; province: string; description: string; amenities: string[]; venue_courts: { id: string; name: string; sport: string; venue_slots: { id: string; starts_at: string; price_baht: number; status: string }[] | null }[] | null }

export default async function VenuesPage() {
  const supabase = await createServerSupabaseClient()
  const { data } = await supabase.from('venue_profiles').select('id, name, province, description, amenities, venue_courts(id, name, sport, venue_slots(id, starts_at, price_baht, status))').eq('is_published', true).order('created_at', { ascending: false })
  const venues = (data ?? []) as unknown as Venue[]
  const now = new Date()

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}>
    <header style={{ background: '#101827', color: 'white', padding: '13px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><Link href="/" style={{ color: 'white', textDecoration: 'none', font: '800 22px var(--font-oswald)' }}>BALLDOENSAI<span style={{ color: '#f5c518' }}>.COM</span></Link><Link href="/venue" style={{ color: '#f5c518', textDecoration: 'none', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 5 }}><Plus size={14} /> ลงสนามของคุณ</Link></header>
    <section style={{ background: 'linear-gradient(115deg,#172033,#0d4c3d)', color: 'white', padding: '36px 18px 40px' }}><div style={{ maxWidth: 920, margin: '0 auto' }}><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.5 }}>PLAY WHERE IT MATTERS</p><h1 style={{ font: '800 clamp(39px,8vw,66px)/.9 var(--font-oswald)', margin: '10px 0' }}>หาสนาม<br /><span style={{ color: '#f5c518' }}>แล้วลงเล่น</span></h1><p style={{ maxWidth: 480, color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>เลือกสนามและส่งคำขอช่วงเวลาว่าง เจ้าของสนามจะตอบกลับในระบบ</p></div></section>
    <section style={{ maxWidth: 920, margin: '0 auto', padding: '22px 16px' }}>{venues.length === 0 ? <div style={{ background: '#fff', border: '1px dashed #cfd5dc', borderRadius: 14, padding: 34, textAlign: 'center' }}><Building2 size={34} color="#CC0001" /><h2>ยังไม่มีสนามที่เปิดรับคำขอ</h2><p style={{ color: '#687586', fontSize: 13 }}>คุณเป็นเจ้าของสนามใช่ไหม? เพิ่มสนามแรกของคุณได้เลย</p><Link href="/venue" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#CC0001', color: 'white', padding: '10px 13px', borderRadius: 8, fontSize: 13, fontWeight: 900, textDecoration: 'none' }}><Plus size={15} /> เพิ่มสนาม</Link></div> : <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,272px),1fr))' }}>{venues.map(venue => <VenueCard key={venue.id} venue={venue} now={now} />)}</div>}</section>
  </main>
}
