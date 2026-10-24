import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { getLocale } from 'next-intl/server'
import { ArrowRight, Bell, BarChart3, CalendarDays, ClipboardList, Crown, IdCard, MapPin, Plus, Search, Sparkles, Trophy, Users, UserSearch } from 'lucide-react'
import BrandMark from '@/components/BrandMark'
import BrandWordmark from '@/components/BrandWordmark'
import HomeCardRing, { type RingCard } from './HomeCardRing'
import { isSampleId, samplePlayerRanks, sampleTournaments, showDemoData } from '@/lib/sample-data'
import { getPublicOpenTournaments, getPublicPlatformCounts, getPublicRankings } from '@/lib/public-data'
import { bangkokToday } from '@/lib/public-tournaments'
import { homeStatsVisible, sportOpenCount } from '@/lib/home-stats'
import { BACKDROP, coverDetailFor, STADIUM } from '@/lib/stock-photos'
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

// Line icons for the sport chips, drawn here: no icon set has all five balls.
const SPORT_ICONS: Record<string, React.ReactNode> = {
  football: <><circle cx="12" cy="12" r="9" /><path d="m12 7 4 3-1.5 4.5h-5L8 10Z" /><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5 17 19M9.5 14.5 7 19M8 10 3.5 8.5" /></>,
  futsal: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18M3.5 9h17M3.5 15h17" /></>,
  basketball: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18M5.6 5.6a9 9 0 0 1 0 12.8M18.4 5.6a9 9 0 0 0 0 12.8" /></>,
  volleyball: <><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 0-3 8.5L12 12M12 12l7.8-4.5M12 12l-1 9M9 11.5a9 9 0 0 1-6 2.5M19.8 7.5A9 9 0 0 1 21 13" /></>,
  badminton: <><path d="M6 18 3 21M6 18a3 3 0 1 0 4.2-4.2" /><path d="m10.2 13.8 6.5-9.3 3.8 3.8-9.3 6.5" /><path d="m13.5 9 3 3M15 6.8l2.2 2.2" /></>,
}

const SPORTS = [
  { key: 'football', label: 'ฟุตบอล', ready: true },
  { key: 'futsal', label: 'ฟุตซอล', ready: false },
  { key: 'basketball', label: 'บาสเกตบอล', ready: false },
  { key: 'volleyball', label: 'วอลเลย์บอล', ready: false },
  { key: 'badminton', label: 'แบดมินตัน', ready: false },
]

// Every other sport a Thai school or club competes in, for the "กีฬาอื่น ๆ" panel. None is
// built yet; the panel says so once, at its top, instead of a badge on each.
const MORE_SPORTS = [
  'เซปักตะกร้อ', 'มวยไทย', 'กรีฑา', 'ว่ายน้ำ', 'เทนนิส', 'เทเบิลเทนนิส', 'เปตอง', 'แฮนด์บอล',
  'บีชวอลเลย์บอล', 'รักบี้', 'ฮอกกี้', 'ซอฟต์บอล', 'เบสบอล', 'กอล์ฟ', 'จักรยาน', 'ยิมนาสติก',
  'เทควันโด', 'ยูโด', 'คาราเต้', 'มวยสากล', 'ยิงธนู', 'ฟันดาบ', 'ยกน้ำหนัก', 'หมากรุก', 'อีสปอร์ต',
]

// The sample cards on the home ring: one card per step. A sample athlete, never a real
// one; skills a coach has not assessed are a dash; every card is labelled a sample.
const RING_CARDS: RingCard[] = [
  { tier: 'starter', step: 'ขั้นที่ 1', title: 'สร้างการ์ดนักกีฬาฟรี', body: 'สมัคร เลือกตำแหน่ง แล้วได้การ์ดเริ่มต้นทันที ยังไม่มีคะแนนจนกว่าจะลงแข่ง', rating: '—', ratingLabel: 'คะแนนฝีมือ', position: 'FW', name: 'นักกีฬาตัวอย่าง', facts: [{ label: 'แต้ม', value: '0' }, { label: 'เหรียญ', value: '0' }], stats: ['PAC', 'SHO', 'PAS', 'DRI', 'DEF'].map(label => ({ label, value: '—' })) },
  { tier: 'rated', step: 'ขั้นที่ 2', title: 'ลงแข่ง ผลขึ้นการ์ด', body: 'ผลแข่งที่ผู้จัดยืนยันเปลี่ยนเป็นคะแนนฝีมือ แต้ม และเหรียญแรก', rating: '1,024', ratingLabel: 'คะแนนฝีมือ', position: 'FW', name: 'นักกีฬาตัวอย่าง', facts: [{ label: 'แต้ม', value: '120' }, { label: 'เหรียญ', value: '1' }], stats: ['PAC', 'SHO', 'PAS', 'DRI', 'DEF'].map(label => ({ label, value: '—' })) },
  { tier: 'hall', step: 'ขั้นที่ 3', title: 'สะสมผลงาน ไปถึงหอเกียรติยศ', body: 'โค้ชประเมินฝีมือ เก็บเหรียญทุกนัด แล้วติดอันดับและหอเกียรติยศ', rating: '1,860', ratingLabel: 'คะแนนฝีมือ', position: 'FW', name: 'นักกีฬาตัวอย่าง', facts: [{ label: 'แต้ม', value: '2,450' }, { label: 'เหรียญ', value: '12' }], stats: [{ label: 'PAC', value: '82' }, { label: 'SHO', value: '79' }, { label: 'PAS', value: '74' }, { label: 'DRI', value: '80' }, { label: 'DEF', value: '61' }] },
]

const sportIcon = (key: string) => <svg className="hm-sport-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{SPORT_ICONS[key]}</svg>

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
  const footballOpen = sportOpenCount(stats)
  const statItems = homeStatsVisible(stats) ? [
    { icon: Trophy, label: 'รายการแข่งทั้งหมด', value: stats.tournaments },
    { icon: CalendarDays, label: 'เปิดรับสมัครตอนนี้', value: stats.openTournaments },
    { icon: Users, label: 'นักกีฬาที่มีคะแนนฝีมือ', value: stats.athletes },
    { icon: BarChart3, label: 'ผลแข่งที่ผู้จัดยืนยัน', value: stats.results },
  ] : []

  return (
    <main className="hm gl gl-scene" style={BACKDROP ? { '--gl-backdrop-photo': `url(${BACKDROP.src})` } as React.CSSProperties : undefined}>
      <div className="hm-stage" style={STADIUM ? { '--gl-stadium-photo': `url(${STADIUM.src})` } as React.CSSProperties : undefined}>
        <span className="hm-beam" aria-hidden="true" />
        <header className="hm-bar">
          <Link href="/" className="hm-logo" aria-label="DOENSAI.com หน้าหลัก">
            <BrandMark size={28} />
            <BrandWordmark />
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
            <h1><span className="hm-line">ฟุตบอลเดินสาย</span><span className="hm-line hm-line-2">มากกว่าการแข่งขัน คือโอกาสของทุกคน</span></h1>
            <p>จัดการแข่งขัน · เชื่อมทีม · สร้างนักกีฬา · พัฒนาวงการกีฬาไทยด้วยข้อมูล</p>
            <div className="hm-ctas">
              <Link href="/tournaments" className="gl-btn gl-btn-primary hm-cta">ค้นหารายการแข่ง<ArrowRight size={18} aria-hidden="true" /></Link>
              <Link href="/dashboard" className="hm-cta-ghost">สร้างรายการแข่ง</Link>
            </div>
            <div className="hm-sports" aria-label="กีฬาในระบบ">
              <span>กีฬา:</span>
              {SPORTS.map(sport => sport.ready
                ? <Link key={sport.key} href="/tournaments" className="hm-sport is-on">{sportIcon(sport.key)}<span>{sport.label}</span>{footballOpen !== null && <span className="hm-sport-count gl-num">· {footballOpen} รายการ</span>}</Link>
                : <span key={sport.key} className="hm-sport is-soon">{sportIcon(sport.key)}<span>{sport.label}</span><small className="hm-soon">เร็ว ๆ นี้</small></span>)}
              <details className="hm-more">
                <summary className="hm-sport is-more"><Plus size={16} aria-hidden="true" /><span>กีฬาอื่น ๆ</span><span className="hm-more-count gl-num">{MORE_SPORTS.length}</span></summary>
                <div className="hm-more-panel gl-panel">
                  <p><b>กำลังจะมาทุกกีฬา</b><small>เราเริ่มจากฟุตบอล แล้วจะเปิดกีฬาอื่นตามลำดับ</small></p>
                  <ul>{MORE_SPORTS.map(name => <li key={name}>{name}</li>)}</ul>
                </div>
              </details>
            </div>
          </div>

          {next && nextBox && <aside className="hm-next gl-panel" aria-labelledby="hm-next-name">
            <div className="hm-next-top">
              <span className="gl-status is-open">รายการถัดไป</span>
              {isSampleId(next.id) && <span className="gl-status is-warn">ตัวอย่าง</span>}
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

          {/* No open tournament yet: three sample cards on a turning ring tell the three
              steps instead of an empty space (owner, 21 Oct 2026). */}
          {!next && <HomeCardRing cards={RING_CARDS} ctaHref={user ? '/card' : '/login'} labels={{ sample: 'การ์ดตัวอย่าง', region: 'การ์ดนักกีฬาตัวอย่าง 3 ขั้น', previous: 'การ์ดก่อนหน้า', next: 'การ์ดถัดไป', pause: 'หยุดหมุนการ์ด', play: 'หมุนการ์ดต่อ', cta: 'เริ่มสร้างการ์ดของคุณ', slide: 'การ์ด' }} />}
        </section>

        {statItems.length > 0 && <section className="hm-stats" aria-label="ตัวเลขของระบบ">
          {statItems.map(item => <div className="hm-stat gl-panel gl-reveal" key={item.label}>
            <span className="hm-stat-icon"><item.icon size={24} aria-hidden="true" /></span>
            <div><small>{item.label}</small><b className="gl-num">{item.value.toLocaleString('en-US')}</b></div>
          </div>)}
        </section>}
      </div>

      <div className="hm-body">
        <section className="hm-panel gl-card gl-reveal hm-tournaments" aria-labelledby="hm-open-title">
          <div className="hm-panel-head"><h2 id="hm-open-title">รายการแข่งที่เปิดรับสมัคร</h2><Link href="/tournaments">ดูทั้งหมด<ArrowRight size={16} aria-hidden="true" /></Link></div>
          {shownTournaments.length > 0 ? <div className="hm-cards">
            {shownTournaments.slice(0, 3).map(item => {
              const box = tournamentDayBox(locale, item.start_date)
              const fee = tournamentFee(item.fee)
              return <Link key={item.id} href={tournamentHref(item.id)} className="hm-card gl-card gl-reveal">
                <span className={`hm-card-cover${coverStyle(item.id) ? ' is-photo' : ''}`} aria-hidden="true">
                  {coverStyle(item.id) && <span className="gl-cover-img" style={coverStyle(item.id)} />}
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

        <section className="hm-panel gl-card gl-reveal hm-ranks" aria-labelledby="hm-rank-title">
          <div className="hm-panel-head"><h2 id="hm-rank-title">อันดับคะแนนฝีมือ</h2><Link href="/ranking">ดูทั้งหมด<ArrowRight size={16} aria-hidden="true" /></Link></div>
          <p className="hm-panel-note">คะแนนฝีมือจากผลแข่งที่ผู้จัดยืนยันเท่านั้น · ฤดูกาล {ACTIVE_SEASON}</p>
          {ranks.length > 0 ? <ol className="hm-rank-list">
            {ranks.map((player, index) => <li key={player.id} className={index < 3 ? `is-medal is-${index + 1}` : undefined}>
              <Link href={isSampleId(player.id) ? '/ranking' : `/players/${player.id}`}>
                <span className={`hm-rank-pos gl-num is-${index + 1}`}>{index + 1}</span>
                <span className="hm-rank-av" aria-hidden="true">{player.player_name.trim().charAt(0)}{index === 0 && <Crown className="hm-rank-crown" size={16} />}</span>
                <span className="hm-rank-name"><b>{player.player_name}{isSampleId(player.id) && <span className="gl-status is-warn hm-rank-sample">ตัวอย่าง</span>}</b><small>{[player.team, player.province ? provinceName(player.province, locale === 'en' ? 'en' : 'th') : null].filter(Boolean).join(' · ')}</small></span>
                <span className="hm-rank-pts gl-num">{player.pts.toLocaleString('en-US')}</span>
              </Link>
            </li>)}
          </ol> : <div className="hm-empty">
            <BarChart3 size={36} strokeWidth={1.4} aria-hidden="true" />
            <p>อันดับจะขึ้นเมื่อมีผลแข่งที่ผู้จัดยืนยันแล้ว</p>
          </div>}
        </section>

        <section className="hm-features gl-card gl-reveal" aria-label="สิ่งที่ทำได้">
          {FEATURES.map(feature => <div className="hm-feature" key={feature.title}>
            <span className="hm-feature-icon"><feature.icon size={24} aria-hidden="true" /></span>
            <span><b>{feature.title}</b><small>{feature.ready ? feature.body : 'เร็ว ๆ นี้'}</small></span>
          </div>)}
          <Link href={user ? '/profile' : '/login'} className="gl-btn gl-btn-primary hm-start">เริ่มใช้งานฟรี<ArrowRight size={18} aria-hidden="true" /></Link>
        </section>

        <footer className="hm-foot">
          <span>DOENSAI.com · แพลตฟอร์มนักกีฬาเยาวชนไทย</span>
          <span>ไม่มีโฆษณา · ไม่ส่งข้อมูลเด็กให้ใครภายนอก · <Link href="/privacy">ความเป็นส่วนตัว</Link> · <Link href="/terms">ข้อกำหนด</Link></span>
        </footer>
      </div>
    </main>
  )
}
