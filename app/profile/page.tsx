import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { House, Trophy, ClipboardList, User, MapPin, Zap, Shield, Star } from 'lucide-react'
import Link from 'next/link'
import EditProfileForm from './EditProfileForm'

type ProfileRecord = {
  full_name?: string | null
  province?: string | null
  team?: string | null
  position?: string | null
  phone?: string | null
}

type PlayerRankRecord = {
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

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  const { data: playerRank } = await supabase
    .from('player_ranks')
    .select('*')
    .eq('player_id', user.id)
    .eq('sport', 'football')
    .single()
  const { data: myTeams } = await supabase
    .from('teams')
    .select('*, tournaments(name, location)')
    .eq('created_by', user.id)
    .order('created_at', { ascending: false })
    .limit(5)

  const typedProfile = (profile ?? null) as ProfileRecord | null
  const typedPlayerRank = (playerRank ?? null) as PlayerRankRecord | null
  const typedTeams = (myTeams ?? []) as MyTeamRecord[]
  const cardBg = 'linear-gradient(160deg,#3d2a00 0%,#c8860a 18%,#f5c518 30%,#c8860a 42%,#7a4f00 55%,#c8860a 70%,#f5c518 82%,#3d2a00 100%)'

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
      </header>

      <div style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
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

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: '16px' }}>
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
                  <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.75)', textAlign: 'center', marginTop: 2 }}>{typedProfile?.team || typedProfile?.province || 'BALLSAI PLAYER'}</div>
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
          </div>
        ) : (
          <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: '24px', textAlign: 'center', marginBottom: 20 }}>
            <Star size={40} color="#ddd" strokeWidth={1} style={{ marginBottom: 10 }} />
            <p style={{ fontSize: 14, fontWeight: 700, color: '#aaa' }}>ยังไม่มีการ์ดนักกีฬา</p>
            <p style={{ fontSize: 12, color: '#ccc', marginTop: 4 }}>เข้าร่วมแข่งขันเพื่อรับ Rating</p>
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
            ข้อมูลส่วนตัว
          </div>
          <EditProfileForm profile={typedProfile} userId={user.id} />
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

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        {[
          { icon: <House size={22} />, label: 'หน้าแรก', href: '/', active: false },
          { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking', active: false },
          { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments', active: false },
          { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile', active: true },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 12px', textDecoration: 'none', color: item.active ? '#CC0001' : '#aaa', minWidth: 55 }}>
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: 700 }}>{item.label}</span>
            {item.active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#CC0001' }} />}
          </Link>
        ))}
      </nav>
    </main>
  )
}
