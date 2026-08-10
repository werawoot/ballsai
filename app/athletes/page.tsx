import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { CheckCircle2, ClipboardList, House, MapPin, Shield, Star, Trophy, User, Users, Zap } from 'lucide-react'
import AthleteFilters from './AthleteFilters'
import { samplePlayerRanks, showDemoData } from '@/lib/sample-data'

type AthleteProfile = {
  user_id: string
  display_name: string
  birth_date?: string | null
  position?: string | null
  province?: string | null
  current_team?: string | null
  profile_image_url?: string | null
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}

type PlayerRank = { id: string; player_id?: string | null; pts: number; ovr: number; position: string }
type DirectoryAthlete = AthleteProfile & { sampleRank?: (typeof samplePlayerRanks)[number] }

function getAge(birthDate?: string | null) {
  if (!birthDate) return null
  const birth = new Date(`${birthDate}T00:00:00`)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age -= 1
  return age
}

function matchesAge(age: number | null, group: string) {
  if (!group) return true
  if (age === null) return false
  if (group === 'u12') return age < 12
  if (group === 'u15') return age < 15
  if (group === 'u18') return age < 18
  if (group === 'adult') return age >= 20
  return true
}

function PositionMark({ position }: { position: string }) {
  if (position === 'GK' || position === 'DF') return <Shield size={25} />
  if (position === 'MF') return <Zap size={25} />
  return <Star size={25} />
}

export default async function AthletesPage({ searchParams }: { searchParams: { search?: string; province?: string; position?: string; age?: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })

  const search = searchParams.search?.trim() || ''
  const province = searchParams.province || ''
  const position = searchParams.position || ''
  const ageGroup = searchParams.age || ''
  let profileQuery = supabase.from('athlete_profiles').select('*').eq('is_public', true).eq('sport', 'football').order('updated_at', { ascending: false })
  if (search) profileQuery = profileQuery.ilike('display_name', `%${search}%`)
  if (province) profileQuery = profileQuery.eq('province', province)
  if (position) profileQuery = profileQuery.eq('position', position)
  const { data: profileRows } = await profileQuery.limit(100)
  const realProfiles = (profileRows ?? []) as AthleteProfile[]
  const athleteIds = realProfiles.map(profile => profile.user_id)
  const { data: rankRows } = athleteIds.length
    ? await supabase.from('player_ranks').select('id, player_id, pts, ovr, position').in('player_id', athleteIds).eq('sport', 'football').eq('season', '2026')
    : { data: [] }
  const rankByAthlete = new Map(((rankRows ?? []) as PlayerRank[]).map(rank => [rank.player_id, rank]))

  const profiles: DirectoryAthlete[] = realProfiles.length > 0 ? realProfiles : showDemoData ? samplePlayerRanks.map(player => ({
    user_id: player.id,
    display_name: player.player_name,
    birth_date: null,
    position: player.position,
    province: player.province,
    current_team: player.team,
    profile_image_url: null,
    verification_level: 'self' as const,
    sampleRank: player,
  })) : []
  const visibleProfiles = profiles.filter(profile => matchesAge(getAge(profile.birth_date), ageGroup))
  const provinces = [...new Set(realProfiles.map(profile => profile.province).filter((value): value is string => Boolean(value)))].sort()

  return (
    <main style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 80 }}>
      <header style={{ height: 54, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#CC0001', color: 'white', position: 'sticky', top: 0, zIndex: 50 }}>
        <Link href="/" style={{ color: 'white', textDecoration: 'none', display: 'flex', gap: 8, alignItems: 'center', fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2 }}><Trophy size={22} />BallDoenSai.com</Link>
        <span style={{ fontSize: 11, fontWeight: 800 }}>ATHLETE DATABASE</span>
      </header>

      <section style={{ background: '#111', color: 'white', padding: '25px 16px 22px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}><span style={{ fontSize: 10, fontWeight: 800, color: '#ff7373' }}>FOOTBALL · THAILAND</span><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(30px,8vw,48px)', lineHeight: 1, marginTop: 5 }}>ค้นหานักกีฬาเยาวชน</h1><p style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>โปรไฟล์ ผลงาน และข้อมูลที่ระบุระดับการยืนยันอย่างชัดเจน</p></div>
      </section>

      <AthleteFilters provinces={provinces} currentSearch={search} currentProvince={province} currentPosition={position} currentAge={ageGroup} />

      <section style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}><h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 17 }}>นักกีฬาที่พบ</h2><span style={{ fontSize: 11, color: '#888' }}>{visibleProfiles.length} โปรไฟล์</span></div>
        {visibleProfiles.length === 0 ? <div style={{ padding: '50px 20px', textAlign: 'center', borderTop: '1px solid #ddd', color: '#888' }}><User size={34} strokeWidth={1.3} /><p style={{ marginTop: 10, fontSize: 13 }}>ยังไม่มีนักกีฬาที่ตรงกับตัวกรอง</p></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 10 }}>
          {visibleProfiles.map(profile => {
            const sampleRank = profile.sampleRank
            const rank = rankByAthlete.get(profile.user_id) || sampleRank
            const routeId = rank?.id || profile.user_id
            const athleteAge = getAge(profile.birth_date)
            const verified = profile.verification_level !== 'self'
            return <Link key={profile.user_id} href={`/players/${routeId}`} style={{ background: 'white', border: '1px solid #dededb', borderRadius: 7, overflow: 'hidden', textDecoration: 'none', color: '#111', minWidth: 0 }}>
              <div style={{ height: 144, position: 'relative', background: profile.profile_image_url ? `url(${profile.profile_image_url}) center top/cover` : '#ececea', display: 'grid', placeItems: 'center', color: '#CC0001' }}>
                {!profile.profile_image_url && <PositionMark position={profile.position || 'FW'} />}
                <span style={{ position: 'absolute', left: 8, top: 8, background: '#111', color: 'white', borderRadius: 4, padding: '3px 7px', fontFamily: 'var(--font-barlow)', fontSize: 10, fontWeight: 800 }}>{profile.position || 'N/A'}</span>
                {verified && <span title="Verified" style={{ position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: '50%', background: '#15803d', color: 'white', display: 'grid', placeItems: 'center' }}><CheckCircle2 size={15} /></span>}
              </div>
              <div style={{ padding: 11 }}>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 4, color: '#777', fontSize: 10 }}><Users size={11} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.current_team || 'ยังไม่ระบุทีม'}</span></div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, color: '#777', fontSize: 10 }}><MapPin size={11} />{profile.province || 'ไม่ระบุ'}{athleteAge !== null && ` · ${athleteAge} ปี`}</div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #eee', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span style={{ fontSize: 9, color: '#999' }}>POWER</span><b style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, color: rank ? '#CC0001' : '#999' }}>{rank ? rank.pts.toLocaleString() : 'UNRATED'}</b></div>
              </div>
            </Link>
          })}
        </div>}
      </section>

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #ddd', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100 }}>
        {[{ icon: <House size={22} />, label: 'หน้าแรก', href: '/' }, { icon: <User size={22} />, label: 'นักกีฬา', href: '/athletes' }, { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking' }, { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments' }, { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile' }].map(item => <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 6px', color: item.href === '/athletes' ? '#CC0001' : '#999', textDecoration: 'none', minWidth: 52 }}>{item.icon}<span style={{ fontSize: 9, fontWeight: 700 }}>{item.label}</span></Link>)}
      </nav>
    </main>
  )
}
