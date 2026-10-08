import Link from 'next/link'
import { Award, Crown, MapPin, Medal, Shield, Sparkles, Trophy } from 'lucide-react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { ACTIVE_SEASON } from '@/lib/season'
import DiscoverTabs from '@/components/DiscoverTabs'
import Pagination from '@/components/Pagination'
import { parsePage } from '@/lib/pagination'
import { fetchHallPage } from '@/lib/public-hall'

type HallEntry = {
  id: string
  season: string
  category: 'champion' | 'mvp' | 'golden_boot' | 'province_leader' | 'rising_star' | 'fair_play'
  age_group: 'U12' | 'U15' | 'U18' | 'OPEN'
  province: string | null
  athlete_id: string | null
  player_rank_id: string | null
  athlete_name: string
  team_name: string | null
  position: string | null
  image_url: string | null
  citation: string
}

// Labels come from messages (hallPage.category.*); this holds only the icon and colour.
const categoryCopy: Record<HallEntry['category'], { icon: typeof Trophy; color: string }> = {
  champion: { icon: Trophy, color: '#f5c518' },
  mvp: { icon: Crown, color: '#f4c861' },
  golden_boot: { icon: Medal, color: '#f0a72d' },
  province_leader: { icon: MapPin, color: '#68c4e5' },
  rising_star: { icon: Sparkles, color: '#ff8e8e' },
  fair_play: { icon: Shield, color: '#70c985' },
}

export default async function HallOfFamePage(
  props: { searchParams: Promise<{ season?: string; category?: string; age?: string; province?: string; page?: string }> }
) {
  const searchParams = await props.searchParams
  const t = await getTranslations('hallPage')
  const ageLabel = (value: string) => (value === 'OPEN' ? t('open') : value)
  const season = searchParams.season || ACTIVE_SEASON
  const category = Object.keys(categoryCopy).includes(searchParams.category || '') ? searchParams.category as HallEntry['category'] : ''
  const age = ['U12', 'U15', 'U18', 'OPEN'].includes(searchParams.age || '') ? searchParams.age! : ''
  const province = searchParams.province || ''
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: items => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const page = parsePage(searchParams.page)
  // One page at a time: a season's honours are read 24 at a time, never all at once.
  const { entries: rows, hasNext } = await fetchHallPage(supabase, { season, page, category, age, province }).catch(error => {
    console.error(JSON.stringify({ level: 'error', event: 'hall_of_fame_fetch_failed', code: error?.code ?? null }))
    return { entries: [], hasNext: false }
  })
  const entries = rows as HallEntry[]
  const selected = new URLSearchParams({ ...(searchParams.season ? { season } : {}), ...(category ? { category } : {}), ...(age ? { age } : {}), ...(province ? { province } : {}) })
  const linkFor = (next: Record<string, string>) => {
    const params = new URLSearchParams(selected)
    Object.entries(next).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key))
    return `/hall-of-fame${params.size ? `?${params.toString()}` : ''}`
  }

  return <main className="hall-page">
    <header className="hall-header"><Link href="/" className="hall-logo"><Trophy size={19} /> BallDoenSai.com</Link><Link href="/ranking" className="hall-ranking-link">{t('rankingLink')}</Link></header>
    <section className="hall-hero"><div className="hall-hero-orbit" /><div><span>{t('eyebrow')}</span><h1>{t('title')}<br /><em>{t('titleEm')}</em></h1><p>{t('intro')}</p></div><div className="hall-season"><small>{t('season')}</small><b>{season}</b></div></section>
    <DiscoverTabs current="/hall-of-fame" />
    <section className="hall-content">
      <div className="hall-filter-row" aria-label={t('filtersLabel')}>
        <Link href={linkFor({ category: '' })} className={!category ? 'is-active' : ''}>{t('all')}</Link>
        {(Object.keys(categoryCopy) as HallEntry['category'][]).map(key => <Link href={linkFor({ category: key })} className={category === key ? 'is-active' : ''} key={key}>{t(`category.${key}`)}</Link>)}
      </div>
      <div className="hall-filter-row hall-filter-secondary">
        {['', 'U12', 'U15', 'U18', 'OPEN'].map(item => <Link href={linkFor({ age: item })} className={age === item ? 'is-active' : ''} key={item || 'all'}>{item ? ageLabel(item) : t('allAges')}</Link>)}
      </div>
      {entries.length ? <div className="hall-entry-grid">{entries.map(entry => {
        const copy = categoryCopy[entry.category]
        const Icon = copy.icon
        const profileHref = entry.player_rank_id ? `/players/${entry.player_rank_id}` : entry.athlete_id ? `/players/${entry.athlete_id}` : null
        const content = <article className="hall-entry"><div className="hall-entry-glow" style={{ background: copy.color }} /><div className="hall-entry-top"><span style={{ color: copy.color }}><Icon size={15} /> {t(`category.${entry.category}`)}</span><small>{ageLabel(entry.age_group)} · {entry.season}</small></div><div className="hall-entry-avatar" style={entry.image_url ? { backgroundImage: `url(${entry.image_url})` } : undefined}><Icon size={50} /></div><h2>{entry.athlete_name}</h2><p>{[entry.position, entry.team_name, entry.province].filter(Boolean).join(' · ')}</p><blockquote>“{entry.citation}”</blockquote><footer>{t('honour')}</footer></article>
        return profileHref ? <Link className="hall-entry-link" href={profileHref} key={entry.id}>{content}</Link> : <div className="hall-entry-link" key={entry.id}>{content}</div>
      })}</div> : <div className="hall-empty"><Award size={38} /><h2>{t('emptyTitle')}</h2><p>{t('emptyBody')}</p><Link href="/ranking">{t('emptyAction')}</Link></div>}
      <Pagination basePath="/hall-of-fame" page={page} hasNext={hasNext} params={{ ...(searchParams.season ? { season } : {}), category, age, province }} />
    </section>
  </main>
}
