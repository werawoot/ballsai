import Link from 'next/link'
import { Building2, Plus } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import VenueCard from '@/components/VenueCard'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { fetchPublishedVenuesPage, type PublishedVenue } from '@/lib/public-venues'
import { parsePage } from '@/lib/pagination'

export default async function VenuesPage({ searchParams }: { searchParams: { page?: string | string[] } }) {
  const supabase = await createServerSupabaseClient()
  const page = parsePage(searchParams?.page)
  const now = new Date()
  let venues: PublishedVenue[] = []
  let hasNext = false
  try {
    ({ venues, hasNext } = await fetchPublishedVenuesPage(supabase, { page, now }))
  } catch (error) {
    // Same as before pagination: a failed read shows the empty state, not an error page.
    console.error(JSON.stringify({ level: 'error', event: 'public_venues_fetch_failed', page, error: error instanceof Error ? error.message : error }))
  }
  const t = await getTranslations('venues')

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 60 }}>
    <PageHeader actions={<Link href="/venue" className="bds-page-header-link"><Plus size={14} aria-hidden="true" /><span>{t('listYourVenue')}</span></Link>} />
    <section style={{ background: 'linear-gradient(115deg,#172033,#0d4c3d)', color: 'white', padding: '36px 18px 40px' }}><div style={{ maxWidth: 920, margin: '0 auto' }}><p style={{ margin: 0, color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.5 }}>PLAY WHERE IT MATTERS</p><h1 style={{ font: '800 clamp(39px,8vw,66px)/.9 var(--font-oswald)', margin: '10px 0' }}>{t('titleTop')}<br /><span style={{ color: '#f5c518' }}>{t('titleBottom')}</span></h1><p style={{ maxWidth: 480, color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>{t('intro')}</p></div></section>
    <section style={{ maxWidth: 920, margin: '0 auto', padding: '22px 16px' }}>{venues.length === 0 ? <div style={{ background: '#fff', border: '1px dashed #cfd5dc', borderRadius: 14, padding: 34, textAlign: 'center' }}><Building2 size={34} color="#CC0001" /><h2>{t('emptyTitle')}</h2><p style={{ color: '#687586', fontSize: 13 }}>{t('emptyBody')}</p><Link href="/venue" style={{ display: 'inline-flex', gap: 6, alignItems: 'center', background: '#CC0001', color: 'white', padding: '10px 13px', borderRadius: 8, fontSize: 13, fontWeight: 900, textDecoration: 'none' }}><Plus size={15} /> {t('addVenue')}</Link></div> : <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,272px),1fr))' }}>{venues.map(venue => <VenueCard key={venue.id} venue={venue} now={now} />)}</div>}<Pagination basePath="/venues" page={page} hasNext={hasNext} /></section>
  </main>
}
