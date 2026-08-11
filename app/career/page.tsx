import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Award, ChevronRight, CircleDot, Crown, Footprints, Medal, Play, ShieldCheck, Sparkles, Trophy, UserRound } from 'lucide-react'
import SiteNav from '@/components/SiteNav'
import { IDENTITY_BADGES, calculateLevel, identityTitle, levelProgress, unlockedBadgeKeys } from '@/lib/digital-identity'

type AthleteProfile = { display_name: string; created_at: string; verification_level: string }
type Rating = { id: string; power_rating: number; matches_played: number; wins: number; goals: number; assists: number; clean_sheets: number; mvps: number; confidence: string }
type RatingEvent = { id: string; created_at: string; rating_change: number; goals: number; assists: number; mvp: boolean; result: string }
type Achievement = { id: number; title: string; event_name: string | null; verification_status: string; created_at: string }
type Team = { id: string; name: string; status: string; created_at: string; tournaments: { name: string | null }[] | null }
type IdentityProgress = { xp_total: number; current_level: number }
type Video = { id: number; title: string; video_url: string; video_type: string; created_at: string }
type UploadedHighlight = { id: number; title: string; media_type: 'image' | 'video'; created_at: string }
type EarnedBadge = { badge_key: string; awarded_at: string }

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default async function CareerPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/career')

  const [{ data: athlete }, { data: rating }, { data: achievements }, { data: teams }, { data: progress }, { data: videos }, { data: highlights }, { data: earnedBadges }] = await Promise.all([
    supabase.from('athlete_profiles').select('display_name, created_at, verification_level').eq('user_id', user.id).maybeSingle(),
    supabase.from('player_ratings').select('id, power_rating, matches_played, wins, goals, assists, clean_sheets, mvps, confidence').eq('player_id', user.id).eq('sport', 'football').maybeSingle(),
    supabase.from('athlete_achievements').select('id, title, event_name, verification_status, created_at').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(12),
    supabase.from('teams').select('id, name, status, created_at, tournaments(name)').eq('created_by', user.id).order('created_at', { ascending: false }).limit(12),
    supabase.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', user.id).maybeSingle(),
    supabase.from('athlete_videos').select('id, title, video_url, video_type, created_at').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(6),
    supabase.from('athlete_highlights').select('id, title, media_type, created_at').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(6),
    supabase.from('athlete_badges').select('badge_key, awarded_at').eq('athlete_id', user.id).order('awarded_at', { ascending: false }),
  ])

  const typedAthlete = athlete as AthleteProfile | null
  const typedRating = rating as Rating | null
  const typedAchievements = (achievements ?? []) as Achievement[]
  const typedTeams = (teams ?? []) as unknown as Team[]
  const typedProgress = progress as IdentityProgress | null
  const typedVideos = (videos ?? []) as Video[]
  const typedHighlights = (highlights ?? []) as UploadedHighlight[]
  const typedEarnedBadges = (earnedBadges ?? []) as EarnedBadge[]
  const { data: ratingEvents } = typedRating
    ? await supabase.from('rating_events').select('id, created_at, rating_change, goals, assists, mvp, result').eq('player_rating_id', typedRating.id).order('created_at', { ascending: false }).limit(20)
    : { data: [] }
  const typedEvents = (ratingEvents ?? []) as RatingEvent[]
  const verifiedAchievements = typedAchievements.filter(item => item.verification_status === 'verified')
  const confirmedTeams = typedTeams.filter(team => team.status === 'confirmed')
  const name = typedAthlete?.display_name || 'นักเตะ BallDoenSai'
  const fallbackXp = (typedRating?.matches_played ?? 0) * 30 + (typedRating?.wins ?? 0) * 20 + (typedRating?.goals ?? 0) * 10 + (typedRating?.assists ?? 0) * 8 + (typedRating?.mvps ?? 0) * 35
  const xpTotal = typedProgress?.xp_total ?? fallbackXp
  const level = typedProgress?.current_level ?? calculateLevel(xpTotal)
  const levelInfo = levelProgress(xpTotal, level)
  const calculatedBadgeKeys = unlockedBadgeKeys({
    hasProfile: Boolean(typedAthlete), matchesPlayed: typedRating?.matches_played, wins: typedRating?.wins,
    goals: typedRating?.goals, assists: typedRating?.assists, cleanSheets: typedRating?.clean_sheets,
    mvps: typedRating?.mvps, powerRating: typedRating?.power_rating,
  })
  const earnedBadgeKeys = new Set(typedEarnedBadges.map(item => item.badge_key))
  const unlockedKeys = new Set([...calculatedBadgeKeys, ...earnedBadgeKeys])

  const badges = IDENTITY_BADGES.map((badge, index) => ({
    ...badge,
    icon: index === 0 ? <UserRound /> : index === 1 ? <Footprints /> : index === 2 ? <Trophy /> : index === 3 ? <Sparkles /> : <Medal />,
    unlocked: unlockedKeys.has(badge.key),
    verified: earnedBadgeKeys.has(badge.key),
  }))

  const events = [
    ...(typedAthlete ? [{ id: 'profile', at: typedAthlete.created_at, icon: <UserRound />, title: 'เริ่มต้น Athlete Passport', detail: `ยินดีต้อนรับ ${name}` }] : []),
    ...confirmedTeams.map(team => ({ id: `team-${team.id}`, at: team.created_at, icon: <ShieldCheck />, title: `เข้าร่วม ${team.tournaments?.[0]?.name || 'รายการแข่งขัน'}`, detail: `ทีม ${team.name} ได้รับการยืนยันแล้ว` })),
    ...typedEvents.map(event => ({ id: `rating-${event.id}`, at: event.created_at, icon: <Sparkles />, title: `Power Rating ${event.rating_change >= 0 ? '+' : ''}${event.rating_change}`, detail: `${event.result === 'win' ? 'ชนะ' : event.result === 'draw' ? 'เสมอ' : 'แพ้'} · ${event.goals > 0 ? `${event.goals} ประตู` : event.assists > 0 ? `${event.assists} แอสซิสต์` : event.mvp ? 'MVP' : 'บันทึกผลการแข่งขัน'}` })),
    ...verifiedAchievements.map(item => ({ id: `achievement-${item.id}`, at: item.created_at, icon: <Award />, title: item.title, detail: item.event_name || 'Achievement ที่ยืนยันแล้ว' })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  return <main className="career-page">
    <header className="career-header"><Link href="/" className="career-logo"><Trophy size={19} /> BallDoenSai.com</Link><div><Link href="/ranking?view=trending" className="career-hall-link"><Crown size={15} /> กำลังมาแรง</Link><Link href="/card" className="career-card-link">PLAYER CARD <ChevronRight size={15} /></Link></div></header>
    <section className="career-hero"><div className="career-hero-orbit" /><div className="career-hero-copy"><p>ATHLETE PASSPORT · 2026</p><h1>เส้นทางของ<br /><em>{name}</em></h1><span>ทุกสนาม ทุกผลงาน และทุกความสำเร็จของคุณอยู่ที่นี่</span></div><div className="career-rating"><small>POWER RATING</small><b>{typedRating?.power_rating?.toLocaleString() || '—'}</b><span>{typedRating ? `${typedRating.matches_played} MATCHES · ${typedRating.confidence.toUpperCase()}` : 'START YOUR JOURNEY'}</span></div></section>

    <section className="career-content">
      <section className="identity-level-card">
        <div className="identity-level-number"><span>LEVEL</span><b>{level.toString().padStart(2, '0')}</b></div>
        <div className="identity-level-copy"><span>{identityTitle(level).toUpperCase()}</span><h2>ทุกผลงานพาคุณไปอีกขั้น</h2><p>{xpTotal.toLocaleString()} XP · อีก {levelInfo.remaining.toLocaleString()} XP สู่ Level {level + 1}</p><div className="identity-level-track"><i style={{ width: `${levelInfo.percentage}%` }} /></div></div>
        <div className="identity-level-note">XP จากผลแข่งที่ผู้จัดยืนยันแล้ว</div>
      </section>
      <div className="career-section-heading"><div><span>UNLOCKED ON THE PITCH</span><h2>Achievement Road</h2></div><p>{badges.filter(badge => badge.unlocked).length}/{badges.length} ปลดล็อกแล้ว</p></div>
      <div className="career-badges">{badges.map(badge => <article className={`career-badge ${badge.unlocked ? 'is-unlocked' : ''}`} key={badge.name}><div>{badge.icon}</div><b>{badge.name}</b><p>{badge.description}</p>{badge.unlocked ? <small>+{badge.xp} XP · {badge.verified ? 'VERIFIED' : 'UNLOCKED'}</small> : <small>LOCKED</small>}</article>)}</div>

      <div className="career-section-heading career-timeline-heading"><div><span>YOUR STORY, IN REAL DATA</span><h2>Career Timeline</h2></div><Link href="/profile">เพิ่มผลงาน <ChevronRight size={15} /></Link></div>
      {events.length ? <div className="career-timeline">{events.map(event => <article key={event.id} className="career-event"><div className="career-event-pin">{event.icon}</div><div><time>{dateLabel(event.at)}</time><h3>{event.title}</h3><p>{event.detail}</p></div></article>)}</div> : <div className="career-empty"><CircleDot size={30} /><h3>ยังไม่มีเรื่องราวบนสนาม</h3><p>สร้างโปรไฟล์ สมัครรายการแข่ง และบันทึกผลงาน เพื่อเริ่ม Athlete Passport ของคุณ</p><Link href="/profile">เริ่มสร้างโปรไฟล์</Link></div>}

      <div className="career-section-heading career-timeline-heading"><div><span>PLAY IT BACK</span><h2>Highlight Moments</h2></div><Link href="/profile">เพิ่ม Highlight <ChevronRight size={15} /></Link></div>
      {typedVideos.length || typedHighlights.length ? <div className="identity-highlight-grid">{typedHighlights.map(item => <a key={`upload-${item.id}`} href={`/api/highlights/${item.id}/media`} target="_blank" rel="noreferrer" className="identity-highlight-card"><span><Play size={17} fill="currentColor" /></span><small>{item.media_type === 'video' ? 'UPLOADED VIDEO' : 'UPLOADED PHOTO'}</small><h3>{item.title}</h3><p>เปิดดู Highlight</p></a>)}{typedVideos.map(video => <a key={`link-${video.id}`} href={video.video_url} target="_blank" rel="noreferrer" className="identity-highlight-card"><span><Play size={17} fill="currentColor" /></span><small>{video.video_type.toUpperCase()}</small><h3>{video.title}</h3><p>เปิดดู Highlight</p></a>)}</div> : <div className="identity-highlight-empty"><Play size={23} /><div><b>เก็บทุกช็อตที่คุณภูมิใจ</b><p>อัปโหลดรูป/วิดีโอ หรือวางลิงก์ YouTube และ TikTok เพื่อให้เส้นทางของคุณมีชีวิต</p></div><Link href="/profile">เพิ่ม Highlight</Link></div>}
    </section>
    <SiteNav active="profile" />
  </main>
}
