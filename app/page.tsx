import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { ArrowRight, Bell, BarChart3, CalendarDays, ClipboardList, IdCard, MapPin, Search, Sparkles, Trophy, Users, UserSearch } from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import { isSampleId, samplePlayerRanks, sampleTournaments, showDemoData } from '@/lib/sample-data'
import { getPublicOpenTournaments, getPublicPlatformCounts, getPublicRankings } from '@/lib/public-data'
import { bangkokToday } from '@/lib/public-tournaments'
import { homeStatsVisible } from '@/lib/home-stats'
import { coverDetailFor, STADIUM } from '@/lib/stock-photos'
import { tournamentCountdown, tournamentDateRange, tournamentDayBox, tournamentFee } from '@/lib/tournament-dates'
import { provinceName } from '@/lib/thai-provinces'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import './glass.css'
import './home-glass.css'

// The home page in the light glass design (ADR-014, owner 21 Oct 2026): a glass bar over
// a real stadium photo, the headline and two ways in, and the next tournament on a glass
// card. Below: the platform numbers (only once they are worth showing, lib/home-stats.ts),
// open tournaments, the top of the skill ranking, and what the platform does, with what is
// not built yet marked as coming. Everything shown is a real row; there are no adverts
// (ADR-012) and no made-up highlights.

type Tournament = { id: string; name: string; location: string | null; start_date: string; end_date?: string | null; fee: number; max_teams?: number | null; status: string | null }
type Rank = { id: string; player_name: string; team?: string | null; province?: string | null; position?: string | null; pts: number }

const SPORTS = [
  { key: 'football', label: 'ฟุตบอล', ready: true },
  { key: 'futsal', label: 'ฟุตซอล', ready: false },
  { key: 'basketball', label: 'บาสเกตบอล', ready: false },
  { key: 'volleyball', label: 'วอลเลย์บอล', ready: false },
  { key: 'badminton', label: 'แบดมินตัน', ready: false },
]

const FEATURES = [
  { icon: ClipboardList, title: 'จัดการแข่งขันง่าย', body: 'รับสมัคร ตรวจสลิป บันทึกผลแข่ง', ready: true },
  { icon: BarChart3, title: 'คะแนนฝีมือจากผลจริง', body: 'ผลแข่งที่ผู้จัดยืนยันขึ้นการ์ดทันที', ready: true },
  { icon: IdCard, title: 'การ์ดนักกีฬา', body: 'ประวัติการเล่น แต้ม และเหรียญ', ready: true },
  { icon: Sparkles, title: 'AI วิเคราะห์ผลงาน', body: 'สรุปจุดเด่นและสิ่งที่ควรฝึก', ready: false },
  { icon: UserSearch, title: 'ค้นหานักกีฬาและทีม', body: 'เชื่อมโค้ช ทีม และโอกาสใหม่', ready: true },
]

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
  const today = bangkokToday()
  const [{ data: { user } }, rankings, tournaments, stats, locale] = await Promise.all([
    supabase.auth.getUser(),
    getPublicRankings({ sport: ACTIVE_SPORT, season: ACTIVE_SEASON }),
    getPublicOpenTournaments(),
    getPublicPlatformCounts(today),
    getLocale(),
  ])

  // Open and not over yet; demo rows stand in only when there is nothing real.
  const realTournaments = ((tournaments ?? []) as Tournament[]).filter(item => (item.end_date ?? item.start_date) >= today)
  const shownTournaments: Tournament[] = realTournaments.length ? realTournaments : showDemoData ? sampleTournaments : []
  const ranks: Rank[] = (rankings?.length ? rankings : showDemoData ? samplePlayerRanks : []).slice(0, 5) as Rank[]
  const next = shownTournaments[0]
  const nextCountdown = next ? tournamentCountdown(today, next.start_date) : null
  const nextBox = next ? tournamentDayBox(locale, next.start_date) : null
  const tournamentHref = (id: string) => isSampleId(id) ? '/tournaments' : `/tournaments/${id}`
  const countdownText = !nextCountdown ? '' : nextCountdown.kind === 'days' ? `อีก ${nextCountdown.count} วัน` : nextCountdown.kind === 'today' ? 'แข่งวันนี้' : nextCountdown.kind === 'tomorrow' ? 'แข่งพรุ่งนี้' : 'กำลังแข่ง'
  const coverStyle = (id: string) => {
    const photo = coverDetailFor(id)
    return photo ? { backgroundImage: `url(${photo.src})` } : undefined
  }
  const statItems = homeStatsVisible(stats) ? [
    { icon: Trophy, label: 'รายการแข่งทั้งหมด', value: stats.tournaments },
    { icon: CalendarDays, label: 'เปิดรับสมัครตอนนี้', value: stats.openTournaments },
    { icon: Users, label: 'นักกีฬาที่มีคะแนนฝีมือ', value: stats.athletes },
    { icon: BarChart3, label: 'ผลแข่งที่ผู้จัดยืนยัน', value: stats.results },
  ] : []

  return (
    <main className="hm gl">
      <div className="hm-stage" style={STADIUM ? { '--gl-stadium-photo': `url(${STADIUM.src})` } as React.CSSProperties : undefined}>
        <header className="hm-bar">
          <Link href="/" className="hm-logo" aria-label="BallDoenSai.com หน้าหลัก">
            <BrandMark size={28} />
            <span>BallDoenSai<em>.com</em></span>
          </Link>
          <nav className="hm-nav gl-panel" aria-label="เมนูหลัก">
            <Link href="/" aria-current="page" className="is-on">หน้าแรก</Link>
            <Link href="/tournaments">รายการแข่ง</Link>
            <Link href="/athletes">นักกีฬา</Link>
            <Link href="/ranking">อันดับ</Link>
            <Link href="/impact">เรื่องของเรา</Link>
          </nav>
          <div className="hm-bar-end">
            <form className="hm-search gl-panel" action="/tournaments" role="search">
              <Search size={18} aria-hidden="true" />
              <label className="hm-sr" htmlFor="hm-q">ค้นหารายการแข่ง</label>
              <input id="hm-q" name="q" type="search" placeholder="ค้นหารายการแข่ง หรือสนาม…" maxLength={60} enterKeyHint="search" />
            </form>
            {user ? <>
              <Link href="/notifications" className="hm-icon-btn" aria-label="แจ้งเตือน"><Bell size={22} aria-hidden="true" /></Link>
              <Link href="/profile" className="hm-login">ของฉัน</Link>
            </> : <Link href="/login" className="hm-login">เข้าสู่ระบบ</Link>}
          </div>
        </header>

        <section className="hm-hero">
          <div className="hm-hero-text">
            <h1>ฟุตบอลเดินสาย<br /><span>มากกว่าการแข่งขัน คือโอกาสของทุกคน</span></h1>
            <p>จัดการแข่งขัน · เชื่อมทีม · สร้างนักกีฬา · พัฒนาวงการกีฬาไทยด้วยข้อมูล</p>
            <div className="hm-ctas">
              <Link href="/tournaments" className="gl-btn gl-btn-primary hm-cta">ค้นหารายการแข่ง<ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href="/dashboard" className="hm-cta-ghost">สร้างรายการแข่ง</Link>
            </div>
            <div className="hm-sports" aria-label="กีฬาในระบบ">
              <span>กีฬา:</span>
              {SPORTS.map(sport => sport.ready
                ? <Link key={sport.key} href="/tournaments" className="hm-sport is-on">{sport.label}</Link>
                : <span key={sport.key} className="hm-sport is-soon">{sport.label} <small>เร็ว ๆ นี้</small></span>)}
            </div>
          </div>

          {next && nextBox && <aside className="hm-next gl-panel" aria-labelledby="hm-next-name">
            <div className="hm-next-top">
              <span className="gl-status is-open">รายการถัดไป</span>
              {nextCountdown && <span className={`hm-next-count${nextCountdown.kind === 'live' ? ' is-live' : ''}`}>{countdownText}</span>}
            </div>
            <div className="hm-next-main">
              <span className="hm-next-date gl-num"><b>{nextBox.day}</b><small>{nextBox.month}</small></span>
              <div>
                <h2 id="hm-next-name">{next.name}</h2>
                {next.location && <p><MapPin size={14} aria-hidden="true" />{next.location}</p>}
              </div>
            </div>
            <dl className="hm-next-facts gl-num">
              <div><dt>ค่าสมัคร</dt><dd>{tournamentFee(next.fee) ?? 'ฟรี'}</dd></div>
              {Number(next.max_teams) > 0 && <div><dt>รับทีม</dt><dd>{Number(next.max_teams)}</dd></div>}
              <div><dt>วันแข่ง</dt><dd>{tournamentDateRange(locale, next.start_date, next.end_date)}</dd></div>
            </dl>
            <Link href={tournamentHref(next.id)} className="gl-btn gl-btn-primary hm-next-cta">ดูรายละเอียดและสมัคร<ArrowRight size={18} aria-hidden="true" /></Link>
          </aside>}
        </section>

        {statItems.length > 0 && <section className="hm-stats" aria-label="ตัวเลขของระบบ">
          {statItems.map(item => <div className="hm-stat gl-panel" key={item.label}>
            <span className="hm-stat-icon"><item.icon size={24} aria-hidden="true" /></span>
            <div><small>{item.label}</small><b className="gl-num">{item.value.toLocaleString('en-US')}</b></div>
          </div>)}
        </section>}
      </div>

      <div className="hm-body">
        <section className="hm-panel hm-tournaments" aria-labelledby="hm-open-title">
          <div className="hm-panel-head"><h2 id="hm-open-title">รายการแข่งที่เปิดรับสมัคร</h2><Link href="/tournaments">ดูทั้งหมด<ArrowRight size={16} aria-hidden="true" /></Link></div>
          {shownTournaments.length > 0 ? <div className="hm-cards">
            {shownTournaments.slice(0, 3).map(item => {
              const box = tournamentDayBox(locale, item.start_date)
              const fee = tournamentFee(item.fee)
              return <Link key={item.id} href={tournamentHref(item.id)} className="hm-card">
                <span className={`hm-card-cover${coverStyle(item.id) ? ' is-photo' : ''}`} style={coverStyle(item.id)} aria-hidden="true">
                  <span className="hm-card-date gl-num"><b>{box.day}</b><small>{box.month}</small></span>
                </span>
                <span className="hm-card-body">
                  <span className="hm-card-chips"><span className="gl-status is-open">เปิดรับสมัคร</span>{isSampleId(item.id) && <span className="gl-status is-warn">ตัวอย่าง</span>}</span>
                  <b>{item.name}</b>
                  {item.location && <span className="hm-card-meta"><MapPin size={14} aria-hidden="true" />{item.location}</span>}
                  <span className="hm-card-meta"><CalendarDays size={14} aria-hidden="true" />{tournamentDateRange(locale, item.start_date, item.end_date)}</span>
                  <span className="hm-card-foot gl-num"><span>{fee ? <>{fee}<small>/ทีม</small></> : 'ฟรี'}</span>{Number(item.max_teams) > 0 && <span><Users size={14} aria-hidden="true" />รับ {Number(item.max_teams)} ทีม</span>}</span>
                  <span className="hm-card-more">ดูรายละเอียด<ArrowRight size={16} aria-hidden="true" /></span>
                </span>
              </Link>
            })}
          </div> : <div className="hm-empty">
            <Trophy size={36} strokeWidth={1.4} aria-hidden="true" />
            <p>ยังไม่มีรายการที่เปิดรับสมัครตอนนี้</p>
            <Link href="/dashboard" className="gl-btn gl-btn-secondary">เป็นผู้จัด? สร้างรายการแรก</Link>
          </div>}
        </section>

        <section className="hm-panel hm-ranks" aria-labelledby="hm-rank-title">
          <div className="hm-panel-head"><h2 id="hm-rank-title">อันดับคะแนนฝีมือ</h2><Link href="/ranking">ดูทั้งหมด<ArrowRight size={16} aria-hidden="true" /></Link></div>
          <p className="hm-panel-note">คะแนนฝีมือจากผลแข่งที่ผู้จัดยืนยันเท่านั้น · ฤดูกาล {ACTIVE_SEASON}</p>
          {ranks.length > 0 ? <ol className="hm-rank-list">
            {ranks.map((player, index) => <li key={player.id}>
              <Link href={isSampleId(player.id) ? '/ranking' : `/players/${player.id}`}>
                <span className={`hm-rank-pos gl-num is-${index + 1}`}>{index + 1}</span>
                <span className="hm-rank-av" aria-hidden="true">{player.player_name.trim().charAt(0)}</span>
                <span className="hm-rank-name"><b>{player.player_name}</b><small>{[player.team, player.province ? provinceName(player.province, locale === 'en' ? 'en' : 'th') : null].filter(Boolean).join(' · ')}</small></span>
                <span className="hm-rank-pts gl-num">{player.pts.toLocaleString('en-US')}</span>
              </Link>
            </li>)}
          </ol> : <div className="hm-empty">
            <BarChart3 size={36} strokeWidth={1.4} aria-hidden="true" />
            <p>อันดับจะขึ้นเมื่อมีผลแข่งที่ผู้จัดยืนยันแล้ว</p>
          </div>}
        </section>

        <section className="hm-features gl-panel" aria-label="สิ่งที่ทำได้">
          {FEATURES.map(feature => <div className="hm-feature" key={feature.title}>
            <span className="hm-feature-icon"><feature.icon size={24} aria-hidden="true" /></span>
            <span><b>{feature.title}</b><small>{feature.ready ? feature.body : 'เร็ว ๆ นี้'}</small></span>
          </div>)}
          <Link href={user ? '/profile' : '/login'} className="gl-btn gl-btn-primary hm-start">เริ่มใช้งานฟรี<ArrowRight size={18} aria-hidden="true" /></Link>
        </section>

        <footer className="hm-foot">
          <span>BallDoenSai.com · แพลตฟอร์มนักกีฬาเยาวชนไทย</span>
          <span>ไม่มีโฆษณา · ไม่ส่งข้อมูลเด็กให้ใครภายนอก · <Link href="/privacy">ความเป็นส่วนตัว</Link> · <Link href="/terms">ข้อกำหนด</Link></span>
        </footer>
      </div>
    </main>
  )
}
