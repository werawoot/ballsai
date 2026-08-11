import Link from 'next/link'
import { Crown, Medal, Shield, Sparkles, Star, Trophy, Zap } from 'lucide-react'
import SiteNav from '@/components/SiteNav'
import { getPublicHallOfFame } from '@/lib/public-data'
import { samplePlayerRanks, showDemoData } from '@/lib/sample-data'

type Rank = {
  id: string
  player_id?: string | null
  player_name: string
  team: string
  province: string
  position: string
  pts: number
  ovr: number
}

function PositionIcon({ position }: { position: string }) {
  if (position === 'GK' || position === 'DF') return <Shield size={32} />
  if (position === 'MF') return <Zap size={32} />
  return <Star size={32} />
}

export default async function HallOfFamePage({ searchParams }: { searchParams: { province?: string } }) {
  const province = searchParams.province?.trim() || ''
  const rankings = await getPublicHallOfFame(province)
  const fallback = showDemoData ? samplePlayerRanks.filter(item => !province || item.province === province) : []
  const players = ((rankings.length ? rankings : fallback) as Rank[]).slice(0, 18)
  const provinces = [...new Set(((rankings.length ? rankings : fallback) as Rank[]).map(player => player.province).filter(Boolean))].sort()
  const podium = players.slice(0, 3)

  return <main className="identity-page hall-page">
    <header className="identity-topbar">
      <Link href="/" className="identity-brand"><Trophy size={19} /> BallDoenSai.com</Link>
      <Link href="/career" className="identity-text-link">MY PASSPORT</Link>
    </header>

    <section className="hall-hero">
      <div className="hall-hero-orbit" /><div className="hall-hero-stars" />
      <div className="identity-container"><p className="identity-kicker"><Crown size={14} /> SEASON 2026 · THAILAND</p><h1>HALL OF<br /><em>FAME</em></h1><p className="hall-hero-copy">พื้นที่เชิดชูนักเตะที่พิสูจน์ตัวเองในสนาม — แยกตามจังหวัดและผลงานจริง</p></div>
    </section>

    <section className="identity-container hall-content">
      <div className="hall-filter-row"><span>เลือกจังหวัด</span><div>{['ทั้งหมด', ...provinces].slice(0, 9).map(item => <Link key={item} className={!province && item === 'ทั้งหมด' || province === item ? 'is-active' : ''} href={item === 'ทั้งหมด' ? '/hall-of-fame' : `/hall-of-fame?province=${encodeURIComponent(item)}`}>{item}</Link>)}</div></div>

      {podium.length > 0 ? <>
        <div className="hall-heading"><div><p>THE LEADING THREE</p><h2>ดาวเด่นของฤดูกาล</h2></div><Sparkles size={24} /></div>
        <div className="hall-podium">{podium.map((player, index) => {
          const place = index + 1
          return <Link key={player.id} href={`/players/${player.id}`} className={`hall-podium-card is-place-${place}`}>
            <div className="hall-place"><Medal size={18} /> #{place}</div><div className="hall-player-mark"><PositionIcon position={player.position} /></div>
            <div className="hall-player-copy"><small>{player.position} · {player.province}</small><h3>{player.player_name}</h3><p>{player.team}</p><b>{player.pts.toLocaleString()} <span>POWER</span></b></div>
          </Link>
        })}</div>
      </> : <div className="identity-empty"><Trophy size={34} /><h2>Hall of Fame กำลังรอคนแรก</h2><p>เมื่อมีผลแข่งขันที่ยืนยันแล้ว นักกีฬาจะเริ่มปรากฏในพื้นที่นี้</p><Link href="/tournaments">ดูรายการแข่งขัน</Link></div>}

      {players.length > 3 && <><div className="hall-heading hall-list-heading"><div><p>KEEP CLIMBING</p><h2>ผู้ท้าชิง</h2></div></div><div className="hall-list">{players.slice(3).map((player, index) => <Link key={player.id} href={`/players/${player.id}`}><strong>{index + 4}</strong><span className="hall-list-mark"><PositionIcon position={player.position} /></span><span><b>{player.player_name}</b><small>{player.position} · {player.team} · {player.province}</small></span><em>{player.pts.toLocaleString()}<small>POWER</small></em></Link>)}</div></>}
    </section>
    <SiteNav active="hall" />
  </main>
}
