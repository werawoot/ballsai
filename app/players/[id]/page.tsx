import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
  ArrowLeft,
  Award,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  House,
  MapPin,
  PlayCircle,
  Ruler,
  Shield,
  Star,
  Trophy,
  User,
  Users,
  Weight,
  Zap,
} from 'lucide-react'
import Link from 'next/link'
import { isSampleId, samplePlayerRanks, showDemoData } from '@/lib/sample-data'

type PlayerRecord = {
  id: string
  player_id?: string | null
  player_name: string
  team: string
  province: string
  position: string
  ovr: number
  pts: number
  pac: number
  sho: number
  pas: number
  dri: number
  def: number
}

type AthleteProfile = {
  user_id: string
  display_name: string
  birth_date?: string | null
  position?: string | null
  province?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  current_team?: string | null
  bio?: string | null
  profile_image_url?: string | null
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}

type AthleteVideo = { id: number; title: string; video_url: string; video_type: string }
type AthleteAchievement = { id: number; title: string; event_name?: string | null; achievement_year?: number | null; proof_url?: string | null; verification_status: string }
type SkillAssessment = { speed?: number | null; stamina?: number | null; strength?: number | null; technique?: number | null; vision?: number | null; source_level: string }

function ageFromBirthDate(value?: string | null) {
  if (!value) return null
  const birth = new Date(`${value}T00:00:00`)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  if (today.getMonth() < birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())) age -= 1
  return age
}

function PositionIcon({ pos, size = 80 }: { pos: string; size?: number }) {
  if (pos === 'GK' || pos === 'DF') return <Shield size={size} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
  if (pos === 'MF') return <Zap size={size} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
  return <Star size={size} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
}

const verificationLabels = {
  self: 'ข้อมูลจากนักกีฬา',
  coach_verified: 'Coach Verified',
  performance_verified: 'Performance Verified',
}

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
      },
    }
  )

  const { data: player } = showDemoData && isSampleId(params.id)
    ? { data: samplePlayerRanks.find(item => item.id === params.id) ?? null }
    : await supabase.from('player_ranks').select('*').eq('id', params.id).single()

  const routeIsUserId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.id)
  const linkedPlayerResult = !player && routeIsUserId
    ? await supabase.from('player_ranks').select('*').eq('player_id', params.id).eq('sport', 'football').maybeSingle()
    : { data: null }
  const rankedPlayer = (player || linkedPlayerResult.data) as PlayerRecord | null
  const athleteId = rankedPlayer?.player_id || (routeIsUserId ? params.id : null)

  let athleteProfile: AthleteProfile | null = null
  let videos: AthleteVideo[] = []
  let achievements: AthleteAchievement[] = []
  let skillAssessment: SkillAssessment | null = null

  if (athleteId) {
    const [profileResult, videoResult, achievementResult, skillResult] = await Promise.all([
      supabase.from('athlete_profiles').select('*').eq('user_id', athleteId).maybeSingle(),
      supabase.from('athlete_videos').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(6),
      supabase.from('athlete_achievements').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(8),
      supabase.from('athlete_skill_assessments').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    ])
    athleteProfile = profileResult.data as AthleteProfile | null
    videos = (videoResult.data ?? []) as AthleteVideo[]
    achievements = (achievementResult.data ?? []) as AthleteAchievement[]
    skillAssessment = skillResult.data as SkillAssessment | null
  }

  if (!rankedPlayer && !athleteProfile) redirect('/athletes')
  const hasRanking = Boolean(rankedPlayer)
  const typedPlayer: PlayerRecord = rankedPlayer || {
    id: params.id,
    player_id: athleteId,
    player_name: athleteProfile?.display_name || 'BallDoenSai.com Athlete',
    team: athleteProfile?.current_team || '-',
    province: athleteProfile?.province || '-',
    position: athleteProfile?.position || 'FW',
    ovr: 0,
    pts: 0,
    pac: 0,
    sho: 0,
    pas: 0,
    dri: 0,
    def: 0,
  }

  const displayName = athleteProfile?.display_name || typedPlayer.player_name
  const team = athleteProfile?.current_team || typedPlayer.team
  const province = athleteProfile?.province || typedPlayer.province
  const position = athleteProfile?.position || typedPlayer.position
  const age = ageFromBirthDate(athleteProfile?.birth_date)
  const verificationLevel = athleteProfile?.verification_level || 'self'
  const isVerified = verificationLevel !== 'self'
  const cardBg = typedPlayer.pts >= 2000
    ? 'linear-gradient(160deg,#3d2a00 0%,#c8860a 18%,#f5c518 30%,#c8860a 42%,#7a4f00 55%,#c8860a 70%,#f5c518 82%,#3d2a00 100%)'
    : typedPlayer.pts >= 1500
      ? 'linear-gradient(160deg,#1a1a1a 0%,#808080 18%,#d0d0d0 30%,#808080 42%,#404040 55%,#808080 70%,#d0d0d0 82%,#1a1a1a 100%)'
      : 'linear-gradient(160deg,#2a1200 0%,#a0522d 18%,#cd7f32 30%,#a0522d 42%,#4a2000 55%,#a0522d 70%,#cd7f32 82%,#2a1200 100%)'

  const cardStats = [
    { key: 'PAC', val: typedPlayer.pac, label: 'Pace' },
    { key: 'SHO', val: typedPlayer.sho, label: 'Shooting' },
    { key: 'PAS', val: typedPlayer.pas, label: 'Passing' },
    { key: 'DRI', val: typedPlayer.dri, label: 'Dribbling' },
    { key: 'DEF', val: typedPlayer.def, label: 'Defending' },
  ]
  const assessedStats = skillAssessment ? [
    { label: 'Speed', value: skillAssessment.speed },
    { label: 'Stamina', value: skillAssessment.stamina },
    { label: 'Strength', value: skillAssessment.strength },
    { label: 'Technique', value: skillAssessment.technique },
    { label: 'Vision', value: skillAssessment.vision },
  ].filter(item => item.value !== null && item.value !== undefined) : []

  return (
    <main className="bds-page" style={{ background: '#f6f6f4', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>
      <header className="bds-header" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}><Trophy size={22} /> BallDoenSai.com</Link>
        <Link href="/athletes" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'white', fontSize: 13, fontWeight: 700, textDecoration: 'none' }}><ArrowLeft size={16} /> นักกีฬา</Link>
      </header>

      <section className="bds-hero" style={{ background: '#CC0001', color: 'white', padding: '24px 16px 44px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(130px,180px) minmax(0,1fr)', gap: 20, alignItems: 'center' }}>
          <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 8, position: 'relative', overflow: 'hidden', background: cardBg, boxShadow: '0 16px 40px rgba(0,0,0,0.32)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,.35),transparent 42%,rgba(255,255,255,.1) 72%,transparent)' }} />
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}><div style={{ fontFamily: 'var(--font-oswald)', fontSize: hasRanking ? 34 : 18, fontWeight: 800, color: '#211500', lineHeight: 1 }}>{hasRanking ? typedPlayer.ovr : 'NEW'}</div><div style={{ fontFamily: 'var(--font-barlow)', fontSize: 13, fontWeight: 800, color: '#211500' }}>{position}</div></div>
            <div style={{ position: 'absolute', inset: '8% 8% 34%', background: athleteProfile?.profile_image_url ? `url(${athleteProfile.profile_image_url}) center top/cover no-repeat` : undefined, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>{!athleteProfile?.profile_image_url && <PositionIcon pos={position} />}</div>
            <div style={{ position: 'absolute', inset: '55% 0 0', padding: '22px 9px 9px', background: 'linear-gradient(transparent,rgba(0,0,0,.9) 40%)', zIndex: 2 }}>
              <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 16, fontWeight: 800, textAlign: 'center', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</div>
              <div style={{ fontSize: 10, textAlign: 'center', opacity: .75 }}>{team}</div>
              {hasRanking && <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 9 }}>{cardStats.map(stat => <div key={stat.key} style={{ textAlign: 'center' }}><b style={{ display: 'block', fontFamily: 'var(--font-oswald)', fontSize: 12 }}>{stat.val}</b><span style={{ fontSize: 7, opacity: .65 }}>{stat.key}</span></div>)}</div>}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(255,255,255,.35)', padding: '4px 9px', borderRadius: 6, fontSize: 10, fontWeight: 800, marginBottom: 10 }}><CheckCircle2 size={13} />{verificationLabels[verificationLevel]}</div>
            <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,7vw,48px)', lineHeight: 1, letterSpacing: 0, overflowWrap: 'anywhere' }}>{displayName}</h1>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,.82)' }}><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={14} />{province}</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={14} />{team}</span></div>
            <div style={{ marginTop: 16, fontFamily: 'var(--font-oswald)', fontSize: 25, fontWeight: 700 }}>{hasRanking ? typedPlayer.pts.toLocaleString() : 'UNRATED'} <span style={{ fontSize: 12, opacity: .7 }}>POWER RATING</span></div>
          </div>
        </div>
      </section>

      <div className="bds-content" style={{ maxWidth: 760, margin: '-20px auto 0', padding: '0 16px', position: 'relative' }}>
        {(assessedStats.length > 0 || hasRanking) && <section style={{ background: 'white', border: '1px solid #e2e2df', borderRadius: 8, padding: 18, marginBottom: 12 }}>
          <h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, marginBottom: 14 }}>ATHLETE SNAPSHOT</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 8 }}>
            {[
              { icon: <CalendarDays size={17} />, label: 'อายุ', value: age !== null ? `${age} ปี` : 'ยังไม่ระบุ' },
              { icon: <MapPin size={17} />, label: 'จังหวัด', value: province },
              { icon: <Ruler size={17} />, label: 'ส่วนสูง', value: athleteProfile?.height_cm ? `${athleteProfile.height_cm} ซม.` : 'ยังไม่ระบุ' },
              { icon: <Weight size={17} />, label: 'น้ำหนัก', value: athleteProfile?.weight_kg ? `${athleteProfile.weight_kg} กก.` : 'ยังไม่ระบุ' },
            ].map(item => <div key={item.label} style={{ padding: 12, background: '#f7f7f5', borderRadius: 6, minWidth: 0 }}><span style={{ color: '#CC0001', display: 'flex', marginBottom: 7 }}>{item.icon}</span><span style={{ display: 'block', fontSize: 10, color: '#888' }}>{item.label}</span><b style={{ display: 'block', fontSize: 13, marginTop: 2, overflowWrap: 'anywhere' }}>{item.value}</b></div>)}
          </div>
          {athleteProfile?.bio && <p style={{ marginTop: 14, fontSize: 13, lineHeight: 1.7, color: '#444' }}>{athleteProfile.bio}</p>}
        </section>}

        <section style={{ background: 'white', border: '1px solid #e2e2df', borderRadius: 8, padding: 18, marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', marginBottom: 14 }}><h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 16 }}>{assessedStats.length ? 'ASSESSED SKILLS' : 'PLAYER CARD STATS'}</h2><span style={{ fontSize: 10, fontWeight: 800, color: isVerified ? '#15803d' : '#888' }}>{skillAssessment ? verificationLabels[skillAssessment.source_level as keyof typeof verificationLabels] : 'ข้อมูลการ์ดปัจจุบัน'}</span></div>
          <div style={{ display: 'grid', gap: 11 }}>
            {(assessedStats.length ? assessedStats : cardStats.map(item => ({ label: item.label, value: item.val }))).map(stat => <div key={stat.label}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, marginBottom: 5 }}><span>{stat.label}</span><span>{stat.value}</span></div><div style={{ height: 6, background: '#eee', overflow: 'hidden', borderRadius: 3 }}><div style={{ height: '100%', width: `${stat.value ?? 0}%`, background: '#CC0001' }} /></div></div>)}
          </div>
        </section>

        {videos.length > 0 && <section style={{ background: 'white', border: '1px solid #e2e2df', borderRadius: 8, padding: 18, marginBottom: 12 }}><h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, marginBottom: 12 }}>HIGHLIGHTS</h2><div style={{ display: 'grid', gap: 7 }}>{videos.map(video => <a key={video.id} href={video.video_url} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 46, padding: '9px 11px', border: '1px solid #e5e5e5', borderRadius: 6, color: '#111', textDecoration: 'none' }}><PlayCircle size={19} color="#CC0001" /><span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{video.title}</span><ExternalLink size={14} color="#999" /></a>)}</div></section>}

        {achievements.length > 0 && <section style={{ background: 'white', border: '1px solid #e2e2df', borderRadius: 8, padding: 18, marginBottom: 12 }}><h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, marginBottom: 12 }}>ACHIEVEMENTS</h2><div>{achievements.map(item => <div key={item.id} style={{ display: 'flex', gap: 11, padding: '10px 0', borderBottom: '1px solid #eee' }}><Award size={19} color={item.verification_status === 'verified' ? '#15803d' : '#CC0001'} /><div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 800 }}>{item.title}</div><div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{[item.event_name, item.achievement_year].filter(Boolean).join(' · ') || 'BallDoenSai.com Athlete'}</div></div>{item.verification_status === 'verified' && <CheckCircle2 size={16} color="#15803d" />}</div>)}</div></section>}
      </div>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100 }}>
        {[{ icon: <House size={22} />, label: 'หน้าแรก', href: '/' }, { icon: <User size={22} />, label: 'นักกีฬา', href: '/athletes' }, { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking' }, { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments' }, { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile' }].map(item => <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 6px', color: item.href === '/athletes' ? '#CC0001' : '#999', textDecoration: 'none', minWidth: 52 }}><span style={{ display: 'flex' }}>{item.icon}</span><span style={{ fontSize: 9, fontWeight: 700 }}>{item.label}</span></Link>)}
      </nav>
    </main>
  )
}
