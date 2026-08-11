import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Crown, Sparkles, Trophy, MapPin, Zap, Shield, Star } from 'lucide-react'
import Link from 'next/link'
import EditProfileForm from './EditProfileForm'
import PublicProfileShare from './PublicProfileShare'
import SiteNav from '@/components/SiteNav'
import { calculateLevel, identityTitle, levelProgress } from '@/lib/digital-identity'
import { ACTIVE_SPORT } from '@/lib/season'

type ProfileRecord = {
  full_name?: string | null
  province?: string | null
  team?: string | null
  position?: string | null
  phone?: string | null
}

type AthleteProfileRecord = {
  user_id: string
  display_name: string
  birth_date?: string | null
  sport: string
  position?: string | null
  province?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  current_team?: string | null
  bio?: string | null
  profile_image_url?: string | null
  guardian_consent_at?: string | null
  is_public: boolean
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}

type AthleteVideoRecord = {
  id: number
  title: string
  video_url: string
  video_type: 'highlight' | 'match' | 'training'
}

type AthleteAchievementRecord = {
  id: number
  title: string
  event_name?: string | null
  achievement_year?: number | null
  proof_url?: string | null
  verification_status: 'unverified' | 'pending' | 'verified' | 'rejected'
}
type AthleteHighlightRecord = { id: number; title: string; media_path: string; media_type: 'image' | 'video' }

type PlayerRankRecord = {
  id: string
  player_name: string
  position: string
  ovr: number
  pts: number
  pac: number
  sho: number
  pas: number
  dri: number
  def: number
}

type MyTeamRecord = {
  id: string
  name: string
  status: 'pending' | 'confirmed' | 'rejected'
  tournaments: {
    name: string | null
    location: string | null
  } | null
}
type IdentityProgress = { xp_total: number; current_level: number }

function PositionIcon({ pos }: { pos: string }) {
  if (pos === 'GK' || pos === 'DF') return <Shield size={56} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
  if (pos === 'MF') return <Zap size={56} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
  return <Star size={56} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
}

export default async function ProfilePage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: profile }, { data: athleteProfile }, { data: athleteVideos }, { data: achievements }, { data: playerRank }, { data: myTeams }, { data: identityProgress }, { data: highlights }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('athlete_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('athlete_videos').select('*').eq('athlete_id', user.id).order('created_at', { ascending: false }),
    supabase.from('athlete_achievements').select('*').eq('athlete_id', user.id).order('created_at', { ascending: false }),
    supabase.from('player_ranks').select('*').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).maybeSingle(),
    supabase.from('teams').select('*, tournaments(name, location)').eq('created_by', user.id).order('created_at', { ascending: false }).limit(5),
    supabase.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', user.id).maybeSingle(),
    supabase.from('athlete_highlights').select('id, title, media_path, media_type').eq('athlete_id', user.id).order('created_at', { ascending: false }),
  ])

  const typedProfile = (profile ?? null) as ProfileRecord | null
  const typedAthleteProfile = (athleteProfile ?? null) as AthleteProfileRecord | null
  const typedVideos = (athleteVideos ?? []) as AthleteVideoRecord[]
  const typedAchievements = (achievements ?? []) as AthleteAchievementRecord[]
  const typedPlayerRank = (playerRank ?? null) as PlayerRankRecord | null
  const typedTeams = (myTeams ?? []) as MyTeamRecord[]
  const typedIdentityProgress = identityProgress as IdentityProgress | null
  const typedHighlights = (highlights ?? []) as AthleteHighlightRecord[]
  const fallbackXp = (typedPlayerRank?.pts ?? 0) >= 1500 ? 900 : typedPlayerRank ? 100 : 0
  const xp = typedIdentityProgress?.xp_total ?? fallbackXp
  const level = typedIdentityProgress?.current_level ?? calculateLevel(xp)
  const levelInfo = levelProgress(xp, level)
  const cardBg = 'linear-gradient(160deg,#3d2a00 0%,#c8860a 18%,#f5c518 30%,#c8860a 42%,#7a4f00 55%,#c8860a 70%,#f5c518 82%,#3d2a00 100%)'

  return (
    <main className="bds-page" style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>
      <header className="bds-header" style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BallDoenSai.com
        </Link>
      </header>

      <div className="bds-hero" style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            MY<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>PROFILE</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>{user.email}</p>
          <form action="/auth/signout" method="POST" style={{ marginTop: 12 }}>
            <button type="submit" style={{ background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '6px 16px', fontSize: 12, fontWeight: 700, color: 'white', cursor: 'pointer', fontFamily: 'var(--font-oswald)', letterSpacing: 1 }}>
              ออกจากระบบ
            </button>
          </form>
        </div>
      </div>

      <svg className="bds-wave" viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div className="bds-content" style={{ padding: '16px' }}>
        <div style={{ background: 'linear-gradient(125deg,#101827,#29456f 68%,#0b5234)', color: 'white', padding: 18, marginBottom: 20, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', width: 170, height: 170, borderRadius: '50%', border: '1px solid rgba(244,185,66,.32)', right: -50, top: -80 }} />
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 15 }}><div style={{ borderRight: '1px solid rgba(255,255,255,.22)', paddingRight: 15, display: 'grid', textAlign: 'center' }}><span style={{ fontFamily: 'var(--font-barlow)', fontSize: 9, letterSpacing: 1.2, color: '#f4c861', fontWeight: 800 }}>LEVEL</span><b style={{ fontFamily: 'var(--font-oswald)', fontSize: 43, lineHeight: .85 }}>{level.toString().padStart(2, '0')}</b></div><div style={{ flex: 1, minWidth: 0 }}><span style={{ fontFamily: 'var(--font-barlow)', fontSize: 9, letterSpacing: 1.2, color: '#f4c861', fontWeight: 800 }}>{identityTitle(level).toUpperCase()}</span><b style={{ display: 'block', fontSize: 16, marginTop: 4 }}>เส้นทางนักบอลของฉัน</b><div style={{ height: 5, background: 'rgba(255,255,255,.15)', marginTop: 11 }}><i style={{ display: 'block', height: '100%', width: `${levelInfo.percentage}%`, background: 'linear-gradient(90deg,#d71920,#f4c861)' }} /></div><small style={{ color: 'rgba(255,255,255,.65)', fontSize: 10, marginTop: 5, display: 'block' }}>{xp.toLocaleString()} XP · อีก {levelInfo.remaining.toLocaleString()} XP สู่ Level {level + 1}</small></div></div>
          <div style={{ position: 'relative', display: 'flex', gap: 9, marginTop: 15 }}><Link href="/career" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: '#d71920', color: 'white', fontSize: 11, fontWeight: 800, textDecoration: 'none', padding: '9px 10px' }}><Sparkles size={14} /> ATHLETE PASSPORT</Link><Link href="/ranking?view=trending" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid rgba(255,255,255,.35)', color: 'white', fontSize: 11, fontWeight: 800, textDecoration: 'none', padding: '8px 10px' }}><Crown size={14} /> กำลังมาแรง</Link></div>
        </div>
        <PublicProfileShare profilePath={`/players/${typedPlayerRank?.id || user.id}`} isPublic={typedAthleteProfile?.is_public ?? false} />
        {typedPlayerRank ? (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
              การ์ดของฉัน
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 210, aspectRatio: '2/3', borderRadius: 16, position: 'relative', overflow: 'hidden', background: cardBg, boxShadow: '0 0 0 2px rgba(245,197,24,0.5), 0 16px 40px rgba(0,0,0,0.25)' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.4) 0%,rgba(255,255,255,0) 40%,rgba(255,255,255,0.12) 70%,rgba(255,255,255,0) 100%)' }} />
                <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 2 }}>
                  <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 34, fontWeight: 800, color: 'rgba(0,0,0,0.8)', lineHeight: 1 }}>{typedPlayerRank.ovr}</div>
                  <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 15, fontWeight: 700, color: 'rgba(0,0,0,0.7)' }}>{typedPlayerRank.position}</div>
                </div>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '60%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <PositionIcon pos={typedPlayerRank.position} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '12px 12px 14px', background: 'linear-gradient(180deg,transparent 0%,rgba(0,0,0,0.72) 30%,rgba(0,0,0,0.92) 100%)', zIndex: 2 }}>
                  <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 16, fontWeight: 800, color: 'white', textAlign: 'center', textTransform: 'uppercase', lineHeight: 1.1 }}>{typedPlayerRank.player_name}</div>
                  <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 2 }}>{typedProfile?.team || typedProfile?.province || 'BALLDOENSAI.COM PLAYER'}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 4, marginTop: 12 }}>
                    {[
                      { key: 'PAC', val: typedPlayerRank.pac },
                      { key: 'SHO', val: typedPlayerRank.sho },
                      { key: 'PAS', val: typedPlayerRank.pas },
                      { key: 'DRI', val: typedPlayerRank.dri },
                      { key: 'DEF', val: typedPlayerRank.def },
                    ].map((stat) => (
                      <div key={stat.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1 }}>{stat.val}</span>
                        <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>{stat.key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div style={{ textAlign: 'center', marginTop: 10, fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, color: '#CC0001' }}>
              {typedPlayerRank.pts.toLocaleString()} Power Rating
            </div>
            <div style={{ textAlign: 'center', marginTop: 12 }}>
              <Link href="/card" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#111827', color: 'white', textDecoration: 'none', padding: '10px 14px', fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, letterSpacing: .4 }}>
                สร้างและแชร์ PLAYER CARD
              </Link>
              <Link href="/career" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'white', color: '#111827', border: '1px solid #111827', textDecoration: 'none', padding: '9px 13px', marginLeft: 8, fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, letterSpacing: .4 }}>
                ATHLETE PASSPORT
              </Link>
            </div>
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: '24px', textAlign: 'center', marginBottom: 20 }}>
            <Star size={40} color="#ddd" strokeWidth={1} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#aaa' }}>ยังไม่มีการ์ดนักกีฬา</p>
            <p style={{ fontSize: 12, color: '#ccc', marginTop: 4 }}>เข้าร่วมแข่งขันเพื่อรับ Rating</p>
            <Link href="/card" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: '#CC0001', color: 'white', textDecoration: 'none', padding: '10px 14px', marginTop: 14, fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, letterSpacing: .4 }}>
              สร้าง STARTER CARD ของฉัน
            </Link>
            <div><Link href="/career" style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: '#555', textDecoration: 'underline', paddingTop: 13, fontSize: 12, fontWeight: 700 }}>ดู Athlete Passport ของฉัน</Link></div>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
            ข้อมูลส่วนตัว
          </div>
          <EditProfileForm
            profile={typedProfile}
            athleteProfile={typedAthleteProfile}
            videos={typedVideos}
            achievements={typedAchievements}
            highlights={typedHighlights}
            userId={user.id}
          />
        </div>

        {typedTeams.length > 0 && (
          <div>
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
              ทีมที่สมัครไว้
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {typedTeams.map((team) => (
                <div key={team.id} style={{ background: 'white', borderRadius: 12, border: '1.5px solid #e5e5e5', padding: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 4 }}>{team.name}</div>
                      <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{team.tournaments?.name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#aaa' }}>
                        <MapPin size={11} /> {team.tournaments?.location}
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: 20,
                        background: team.status === 'confirmed' ? '#dcfce7' : team.status === 'rejected' ? '#fee2e2' : '#fef9c3',
                        color: team.status === 'confirmed' ? '#16a34a' : team.status === 'rejected' ? '#CC0001' : '#854d0e',
                      }}
                    >
                      {team.status === 'confirmed' ? '✓ ยืนยันแล้ว' : team.status === 'rejected' ? '✗ ไม่ผ่าน' : '⏳ รอยืนยัน'}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <SiteNav active="profile" />
    </main>
  )
}
