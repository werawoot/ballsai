import { getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import SponsorClient, { type BrandProfile, type Opportunity, type Interest } from './SponsorClient'
import PageHeader from '@/components/PageHeader'

export default async function SponsorPage() {
  const tl = await getTranslations('labels')
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/sponsor')
  const { data: profile } = await supabase.from('sponsor_profiles').select('id, brand_name, description, website_url').eq('owner_id', user.id).maybeSingle()
  const { data: opportunities } = profile
    ? await supabase.from('sponsorship_opportunities').select('id,title,description,sport,province,age_note,benefit_note,deadline_at,status,created_at').eq('sponsor_id', profile.id).order('created_at', { ascending: false })
    : { data: [] }
  const ids = (opportunities ?? []).map(item => item.id)
  const { data: interests } = ids.length
    ? await supabase.from('sponsorship_interests').select('id,opportunity_id,message,status,created_at,athlete_profiles(display_name,province,position,verification_level)').in('opportunity_id', ids).order('created_at', { ascending: false })
    : { data: [] }
  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}>
    <PageHeader actions={<Link href="/sponsorships" className="bds-page-header-link"><span>ดูโอกาสสาธารณะ</span></Link>} />
    <section style={{ background: 'linear-gradient(112deg,#101827,#542d0a)', color: 'white', padding: '35px 18px 39px' }}><div style={{ maxWidth: 980, margin: '0 auto' }}><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.5 }}>{tl('sponsorPage.eyebrow')}</p><h1 style={{ margin: '10px 0 8px', font: '800 clamp(37px,7vw,62px)/.9 var(--font-oswald)' }}>{tl('sponsorPage.titleLine1')}<br /><span style={{ color: '#f5c518' }}>{tl('sponsorPage.titleLine2')}</span></h1><p style={{ maxWidth: 590, color: 'rgba(255,255,255,.72)', margin: 0, fontSize: 13, lineHeight: 1.55 }}>เปิดโอกาสให้นักกีฬาที่อนุญาตเผยแพร่โปรไฟล์เลือกแสดงความสนใจด้วยตัวเอง</p></div></section>
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '22px 16px' }}><SponsorClient profile={profile as BrandProfile | null} opportunities={(opportunities ?? []) as Opportunity[]} interests={(interests ?? []) as unknown as Interest[]} /></section>
  </main>
}
