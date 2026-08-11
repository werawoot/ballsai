import Link from 'next/link'
import { Award, Crown, MapPin, Medal, Shield, Sparkles, Trophy } from 'lucide-react'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import SiteNav from '@/components/SiteNav'
import { ACTIVE_SEASON } from '@/lib/season'

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

const categoryCopy: Record<HallEntry['category'], { label: string; icon: typeof Trophy; color: string }> = {
  champion: { label: 'CHAMPION', icon: Trophy, color: '#f5c518' },
  mvp: { label: 'MVP', icon: Crown, color: '#f4c861' },
  golden_boot: { label: 'GOLDEN BOOT', icon: Medal, color: '#f0a72d' },
  province_leader: { label: 'PROVINCE LEADER', icon: MapPin, color: '#68c4e5' },
  rising_star: { label: 'RISING STAR', icon: Sparkles, color: '#ff8e8e' },
  fair_play: { label: 'FAIR PLAY', icon: Shield, color: '#70c985' },
}

export default async function HallOfFamePage({ searchParams }: { searchParams: { season?: string; category?: string; age?: string; province?: string } }) {
  const season = searchParams.season || ACTIVE_SEASON
  const category = Object.keys(categoryCopy).includes(searchParams.category || '') ? searchParams.category as HallEntry['category'] : ''
  const age = ['U12', 'U15', 'U18', 'OPEN'].includes(searchParams.age || '') ? searchParams.age! : ''
  const province = searchParams.province || ''
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: items => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  let query = supabase.from('hall_of_fame_entries').select('id, season, category, age_group, province, athlete_id, player_rank_id, athlete_name, team_name, position, image_url, citation').eq('season', season).order('awarded_at', { ascending: false })
  if (category) query = query.eq('category', category)
  if (age) query = query.eq('age_group', age)
  if (province) query = query.eq('province', province)
  const { data } = await query
  const entries = (data ?? []) as HallEntry[]
  const selected = new URLSearchParams({ ...(category ? { category } : {}), ...(age ? { age } : {}), ...(province ? { province } : {}) })
  const linkFor = (next: Record<string, string>) => {
    const params = new URLSearchParams(selected)
    Object.entries(next).forEach(([key, value]) => value ? params.set(key, value) : params.delete(key))
    return `/hall-of-fame${params.size ? `?${params.toString()}` : ''}`
  }

  return <main className="hall-page">
    <header className="hall-header"><Link href="/" className="hall-logo"><Trophy size={19} /> BallDoenSai.com</Link><Link href="/ranking" className="hall-ranking-link">LIVE RANKING</Link></header>
    <section className="hall-hero"><div className="hall-hero-orbit" /><div><span>THE RECORD THAT STAYS</span><h1>HALL OF<br /><em>FAME</em></h1><p>ผลงานที่ถูกบันทึกไว้ แม้อันดับวันนี้จะเปลี่ยนไป</p></div><div className="hall-season"><small>SEASON</small><b>{season}</b></div></section>
    <section className="hall-content">
      <div className="hall-filter-row" aria-label="ตัวกรอง Hall of Fame">
        <Link href={linkFor({ category: '' })} className={!category ? 'is-active' : ''}>ทั้งหมด</Link>
        {Object.entries(categoryCopy).map(([key, item]) => <Link href={linkFor({ category: key })} className={category === key ? 'is-active' : ''} key={key}>{item.label}</Link>)}
      </div>
      <div className="hall-filter-row hall-filter-secondary">
        {['', 'U12', 'U15', 'U18', 'OPEN'].map(item => <Link href={linkFor({ age: item })} className={age === item ? 'is-active' : ''} key={item || 'all'}>{item || 'ทุกช่วงอายุ'}</Link>)}
      </div>
      {entries.length ? <div className="hall-entry-grid">{entries.map(entry => {
        const copy = categoryCopy[entry.category]
        const Icon = copy.icon
        const profileHref = entry.player_rank_id ? `/players/${entry.player_rank_id}` : entry.athlete_id ? `/players/${entry.athlete_id}` : null
        const content = <article className="hall-entry"><div className="hall-entry-glow" style={{ background: copy.color }} /><div className="hall-entry-top"><span style={{ color: copy.color }}><Icon size={15} /> {copy.label}</span><small>{entry.age_group} · {entry.season}</small></div><div className="hall-entry-avatar" style={entry.image_url ? { backgroundImage: `url(${entry.image_url})` } : undefined}><Icon size={50} /></div><h2>{entry.athlete_name}</h2><p>{[entry.position, entry.team_name, entry.province].filter(Boolean).join(' · ')}</p><blockquote>“{entry.citation}”</blockquote><footer>OFFICIAL BALLDOENSAI HONOUR</footer></article>
        return profileHref ? <Link className="hall-entry-link" href={profileHref} key={entry.id}>{content}</Link> : <div className="hall-entry-link" key={entry.id}>{content}</div>
      })}</div> : <div className="hall-empty"><Award size={38} /><h2>กำลังรอชื่อแรกใน Hall</h2><p>Hall of Fame จะแสดงเฉพาะผลงานที่ผู้จัดหรือผู้ดูแลยืนยันและประกาศอย่างเป็นทางการ</p><Link href="/ranking">ดู LIVE RANKING ระหว่างนี้</Link></div>}
    </section>
    <SiteNav active="ranking" />
  </main>
}
