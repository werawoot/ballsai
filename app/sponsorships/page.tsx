import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import SponsorshipsClient, { type PublicOpportunity } from './SponsorshipsClient'
import PageHeader from '@/components/PageHeader'

export default async function SponsorshipsPage() {
  const tl = await getTranslations('labels')
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  const { data: opportunities } = await supabase.from('sponsorship_opportunities').select('id,title,description,sport,province,age_note,benefit_note,deadline_at,created_at,sponsor_profiles(brand_name)').eq('status', 'open').order('created_at', { ascending: false }).limit(80)
  const { data: interests } = user ? await supabase.from('sponsorship_interests').select('opportunity_id').eq('athlete_id', user.id) : { data: [] }
  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}><PageHeader actions={<Link href="/sponsor" className="bds-page-header-link"><span>{tl('sponsorshipsPage.forSponsors')}</span></Link>} /><section style={{ background: 'linear-gradient(112deg,#101827,#542d0a)', color: 'white', padding: '35px 18px 39px' }}><div style={{ maxWidth: 950, margin: '0 auto' }}><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.5 }}>{tl('sponsorshipsPage.eyebrow')}</p><h1 style={{ margin: '10px 0 8px', font: '800 clamp(37px,7vw,62px)/.9 var(--font-oswald)' }}>{tl('sponsorshipsPage.titleLine1')}<br /><span style={{ color: '#f5c518' }}>{tl('sponsorshipsPage.titleLine2')}</span></h1><p style={{ maxWidth: 600, color: 'rgba(255,255,255,.72)', margin: 0, fontSize: 13, lineHeight: 1.55 }}>เลือกแสดงความสนใจด้วยตัวเอง แบรนด์จะเห็นเฉพาะสิ่งที่คุณเปิดเผยในโปรไฟล์สาธารณะ</p></div></section><section style={{ maxWidth: 950, margin: '0 auto', padding: '22px 16px' }}><SponsorshipsClient opportunities={(opportunities ?? []) as unknown as PublicOpportunity[]} appliedIds={(interests ?? []).map(row => row.opportunity_id)} signedIn={Boolean(user)} /></section></main>
}
