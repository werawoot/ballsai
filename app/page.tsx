import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import {
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  House,
  MapPin,
  Search,
  Sparkles,
  Trophy,
  User,
  Users,
} from 'lucide-react'
import { isSampleId, samplePlayerRanks, sampleTournaments, showDemoData } from '@/lib/sample-data'
import HomeHeroCarousel from './HomeHeroCarousel'

const positionLabel: Record<string, string> = { GK: 'GOALKEEPER', DF: 'DEFENDER', MF: 'MIDFIELDER', FW: 'FORWARD' }

export default async function Home() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    },
  )

  const [{ data: { user } }, { data: rankings }, { data: tournaments }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('player_ranks').select('*').eq('sport', 'football').eq('season', '2026').order('pts', { ascending: false }).limit(6),
    supabase.from('tournaments').select('*').eq('status', 'open').order('start_date', { ascending: true }).limit(4),
  ])

  const displayRankings = rankings?.length ? rankings : showDemoData ? samplePlayerRanks.slice(0, 6) : []
  const displayTournaments = tournaments?.length ? tournaments : showDemoData ? sampleTournaments.slice(0, 4) : []
  const topThree = displayRankings.slice(0, 3)
  const podiumPlayers = topThree.length === 3 ? [topThree[1], topThree[0], topThree[2]] : topThree

  return (
    <main className="home-page">
      <header className="home-header">
        <Link href="/" className="home-logo" aria-label="BallDoenSai.com หน้าหลัก">
          <span className="home-logo-mark"><Trophy size={16} /></span>
          BallDoenSai.com
        </Link>
        <div className="home-header-actions">
          <Link href="/athletes" className="home-header-search"><Search size={16} /><span>ค้นหานักกีฬา</span></Link>
          {user ? (
            <form action="/auth/signout" method="POST"><button className="home-login" type="submit">ออกจากระบบ</button></form>
          ) : <Link href="/login" className="home-login">เข้าสู่ระบบ</Link>}
        </div>
      </header>

      <HomeHeroCarousel />

      <div className="home-ticker" aria-label="ข้อมูลเด่นของแพลตฟอร์ม">
        <div className="home-ticker-track">
          <span><Sparkles size={14} /> RANKING อัปเดตทุกสัปดาห์</span><i />
          <span><Users size={14} /> พื้นที่ของนักกีฬาเยาวชนไทย</span><i />
          <span><Trophy size={14} /> รายการแข่งทั่วประเทศ</span><i />
          <span><Sparkles size={14} /> RANKING อัปเดตทุกสัปดาห์</span><i />
          <span><Users size={14} /> พื้นที่ของนักกีฬาเยาวชนไทย</span><i />
        </div>
      </div>

      <section className="home-spotlight">
        <div className="home-section-heading home-reveal">
          <div><span className="home-eyebrow">SPOTLIGHT / 01</span><h2>ดาวรุ่ง<br />ที่น่าจับตา</h2></div>
          <Link href="/ranking" className="home-text-link">ดู Ranking <ChevronRight size={16} /></Link>
        </div>
        {topThree.length ? <div className="home-podium" aria-label="อันดับนักกีฬา 3 อันดับแรก">
          {podiumPlayers.map((player, index) => {
            const rank = topThree.indexOf(player) + 1
            return <Link key={player.id} href={isSampleId(player.id) ? '/ranking' : `/players/${player.id}`} className={`home-podium-card is-rank-${rank} home-reveal home-reveal-delay-${index + 1}`}>
              <div className="home-podium-shine" />
              <div className="home-podium-photo" aria-hidden="true" />
              {rank === 1 && <div className="home-podium-crown"><Trophy size={18} /></div>}
              <div className="home-podium-top"><span>POWER</span><b>{player.pts.toLocaleString()}</b></div>
              <div className="home-podium-player"><span>{positionLabel[player.position] || player.position}</span><h3>{player.player_name}</h3><p>{player.team}</p></div>
              <div className="home-podium-rank"><span>อันดับ</span><b>0{rank}</b></div>
              <div className="home-podium-stats"><span>OVR <b>{player.ovr}</b></span><span>PAC <b>{player.pac}</b></span><span>SHO <b>{player.sho}</b></span></div>
              <div className="home-podium-base"><span>{rank === 1 ? 'CHAMPION' : rank === 2 ? 'RUNNER UP' : 'TOP THREE'}</span></div>
            </Link>
          })}
        </div> : <div className="home-empty">กำลังรอข้อมูล Ranking ฤดูกาลนี้</div>}
      </section>

      <section className="home-discover">
        <div className="home-discover-copy home-reveal">
          <span className="home-eyebrow">FIND YOUR NEXT STAR</span>
          <h2>ค้นหาคนที่<br /><em>กำลังสร้างชื่อ</em></h2>
          <p>โปรไฟล์นักกีฬา ผลงาน และ Highlight ที่รวมไว้เพื่อให้โค้ช สโมสร และทุกคนได้เห็น</p>
          <Link href="/athletes" className="home-dark-cta">เข้าสู่ Athlete Database <ArrowUpRight size={17} /></Link>
        </div>
        <div className="home-discover-visual home-reveal home-reveal-delay-2" aria-hidden="true">
          <div className="home-discover-ring" />
          <div className="home-discover-ball">บอล<br />ไทย</div>
          <span className="home-visual-note home-note-top">PROVE IT<br />ON THE PITCH</span>
          <span className="home-visual-note home-note-bottom">01 — 77 จังหวัด</span>
        </div>
      </section>

      <section className="home-tournaments">
        <div className="home-section-heading home-reveal">
          <div><span className="home-eyebrow">PLAY / COMPETE / GROW</span><h2>รายการแข่ง<br />ที่เปิดรับสมัคร</h2></div>
          <Link href="/tournaments" className="home-text-link">ดูทั้งหมด <ChevronRight size={16} /></Link>
        </div>
        <div className="home-tournament-list">
          {displayTournaments.map((tournament, index) => (
            <Link key={tournament.id} href={isSampleId(tournament.id) ? '/tournaments' : `/tournaments/${tournament.id}`} className={`home-tournament home-reveal home-reveal-delay-${Math.min(index + 1, 4)}`}>
              <div className="home-tournament-date"><CalendarDays size={17} /><span>{tournament.start_date}</span></div>
              <div className="home-tournament-name"><span>OPEN NOW</span><h3>{tournament.name}</h3><p><MapPin size={13} /> {tournament.location}</p></div>
              <div className="home-tournament-fee"><span>ENTRY</span><b>฿{tournament.fee}</b></div>
              <ArrowUpRight size={20} />
            </Link>
          ))}
          {displayTournaments.length === 0 && <div className="home-empty">ยังไม่มีรายการที่เปิดรับสมัคร</div>}
        </div>
      </section>

      <section className="home-closing">
        <span className="home-eyebrow">BALLDOENSAI.COM FOR THE NEXT GENERATION</span>
        <h2>ไม่ได้แค่เล่น<br /><em>แต่กำลังไปไกล</em></h2>
        <Link href={user ? '/profile' : '/login'} className="home-primary-cta">สร้างโปรไฟล์ของคุณ <ArrowUpRight size={18} /></Link>
      </section>

      <nav className="home-nav">
        {[
          { icon: <House size={20} />, label: 'หน้าแรก', href: '/', active: true },
          { icon: <Search size={20} />, label: 'นักกีฬา', href: '/athletes', active: false },
          { icon: <Trophy size={20} />, label: 'Ranking', href: '/ranking', active: false },
          { icon: <ClipboardList size={20} />, label: 'รายการแข่ง', href: '/tournaments', active: false },
          { icon: <User size={20} />, label: 'โปรไฟล์', href: '/profile', active: false },
        ].map(item => <Link key={item.href} href={item.href} className={`home-nav-item ${item.active ? 'is-active' : ''}`}>{item.icon}<span>{item.label}</span></Link>)}
      </nav>
    </main>
  )
}
