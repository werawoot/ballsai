import Link from 'next/link'
import { ArrowLeft, Building2, ImageIcon } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import VenuePhotoModerationList, { type VenuePhotoModerationItem } from './VenuePhotoModerationList'

type PhotoRow = {
  id: string
  venue_id: string
  caption: string
  is_cover: boolean
  moderation_status: VenuePhotoModerationItem['status']
  created_at: string
  venue_profiles: { name: string; province: string } | null
}

export const dynamic = 'force-dynamic'

export default async function VenuePhotoModerationPage({ searchParams }: { searchParams?: { queue?: string } }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/')

  const queue = searchParams?.queue === 'visible' || searchParams?.queue === 'hidden' ? searchParams.queue : 'pending'
  const { data, error } = await supabase
    .from('venue_photos')
    .select('id, venue_id, caption, is_cover, moderation_status, created_at, venue_profiles!inner(name, province)')
    .eq('moderation_status', queue)
    .order('created_at', { ascending: false })
    .limit(50)
  const items = ((data ?? []) as unknown as PhotoRow[]).map(row => ({
    id: row.id, venueId: row.venue_id, venueName: row.venue_profiles?.name ?? 'ไม่ระบุสนาม',
    province: row.venue_profiles?.province ?? 'ไม่ระบุจังหวัด', caption: row.caption,
    isCover: row.is_cover, status: row.moderation_status, createdAt: row.created_at,
  }))

  return <main style={{ background: '#f4f6f8', minHeight: '100vh', paddingBottom: 56 }}>
    <header style={{ alignItems: 'center', background: '#0c1421', color: 'white', display: 'flex', justifyContent: 'space-between', padding: '13px clamp(16px,5vw,64px)' }}><Link href="/admin/operations" style={{ alignItems: 'center', color: 'white', display: 'inline-flex', fontSize: 13, fontWeight: 800, gap: 7, textDecoration: 'none' }}><ArrowLeft size={17} /> Command Center</Link><span style={{ color: '#f5c518', font: '800 11px var(--font-oswald)', letterSpacing: 1.4 }}>ADMIN ONLY</span></header>
    <section style={{ background: 'linear-gradient(120deg,#0c1421,#203d58)', color: 'white', padding: '31px clamp(16px,5vw,64px)' }}><div style={{ margin: '0 auto', maxWidth: 1000 }}><p style={{ color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.4, margin: 0 }}>VENUE SAFETY QUEUE</p><h1 style={{ font: '800 clamp(34px,6vw,56px)/.92 var(--font-oswald)', margin: '8px 0' }}>VENUE PHOTO<br /><span style={{ color: '#f5c518' }}>MODERATION.</span></h1><p style={{ color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55, margin: 0, maxWidth: 600 }}>อนุมัติภาพที่เหมาะสมก่อนเผยแพร่ หรือซ่อนภาพที่ไม่ควรแสดงต่อผู้เล่น</p></div></section>
    <section style={{ margin: '0 auto', maxWidth: 1000, padding: '22px 16px' }}>
      <nav aria-label="คิวตรวจรูปสนาม" style={{ background: '#111827', borderRadius: 11, display: 'grid', gap: 5, gridTemplateColumns: 'repeat(3,1fr)', padding: 5 }}>
        {[['pending', 'รอตรวจ'], ['visible', 'เผยแพร่'], ['hidden', 'ซ่อนแล้ว']].map(([key, label]) => <Link key={key} href={`/admin/venue-photos?queue=${key}`} style={{ background: queue === key ? '#cc0001' : 'transparent', borderRadius: 8, color: '#fff', fontSize: 12, fontWeight: 900, padding: 9, textAlign: 'center', textDecoration: 'none' }}>{label}</Link>)}
      </nav>
      {error ? <p style={{ background: '#fff8e8', borderRadius: 11, color: '#854d0e', fontSize: 12, fontWeight: 800, marginTop: 14, padding: 12 }}>ยังอ่านคิวรูปสนามไม่ได้ กรุณาตรวจว่า SQL43 ถูก apply แล้ว</p> : <section style={{ background: '#fff', border: '1px solid #e1e6ec', borderRadius: 15, marginTop: 14, padding: 15 }}><h2 style={{ alignItems: 'center', color: '#172033', display: 'flex', fontSize: 18, gap: 8, margin: '0 0 14px' }}><ImageIcon color="#cc0001" size={20} /> {queue === 'pending' ? 'รูปที่รอตรวจ' : queue === 'visible' ? 'รูปที่เผยแพร่แล้ว' : 'รูปที่ถูกซ่อน'}</h2><VenuePhotoModerationList items={items} /></section>}
      <p style={{ alignItems: 'center', color: '#728094', display: 'flex', fontSize: 11, gap: 5, lineHeight: 1.5, margin: '14px 2px 0' }}><Building2 size={14} /> การตัดสินจะผ่าน SQL43 RPC และบันทึก Audit log อัตโนมัติ</p>
    </section>
  </main>
}
