import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Trophy, House, ClipboardList, User, MapPin, ArrowLeft, Zap, Shield, Star } from 'lucide-react'
import Link from 'next/link'

export default async function PlayerPage({ params }: { params: { id: string } }) {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: player } = await supabase
    .from('player_ranks')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!player) redirect('/ranking')

  const cardBg = player.pts >= 5000
    ? 'linear-gradient(160deg,#3d2a00 0%,#c8860a 18%,#f5c518 30%,#c8860a 42%,#7a4f00 55%,#c8860a 70%,#f5c518 82%,#3d2a00 100%)'
    : player.pts >= 3000
    ? 'linear-gradient(160deg,#1a1a1a 0%,#808080 18%,#d0d0d0 30%,#808080 42%,#404040 55%,#808080 70%,#d0d0d0 82%,#1a1a1a 100%)'
    : 'linear-gradient(160deg,#2a1200 0%,#a0522d 18%,#cd7f32 30%,#a0522d 42%,#4a2000 55%,#a0522d 70%,#cd7f32 82%,#2a1200 100%)'

  const PosIcon = ({ pos, size = 80 }: { pos: string; size?: number }) => {
    if (pos === 'GK' || pos === 'DF') return <Shield size={size} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
    if (pos === 'MF') return <Zap size={size} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
    return <Star size={size} color="rgba(255,255,255,0.9)" strokeWidth={1.5} />
  }

  const stats = [
    { key: 'PAC', val: player.pac, label: 'Pace' },
    { key: 'SHO', val: player.sho, label: 'Shooting' },
    { key: 'PAS', val: player.pas, label: 'Passing' },
    { key: 'DRI', val: player.dri, label: 'Dribbling' },
    { key: 'DEF', val: player.def, label: 'Defending' },
  ]

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>

      {/* TOPBAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <Link href="/ranking" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

      {/* HERO WITH CARD */}
      <div style={{ background: '#CC0001', padding: '24px 16px 60px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center' }}>
          <div style={{ width: 180, aspectRatio: '2/3', borderRadius: 14, position: 'relative', overflow: 'hidden', background: cardBg, boxShadow: '0 0 0 2px rgba(245,197,24,0.5), 0 20px 60px rgba(0,0,0,0.4)' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.4) 0%,rgba(255,255,255,0) 40%,rgba(255,255,255,0.12) 70%,rgba(255,255,255,0) 100%)' }} />
            <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 2 }}>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 36, fontWeight: 800, color: 'rgba(0,0,0,0.75)', lineHeight: 1 }}>{player.ovr}</div>
              <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 13, fontWeight: 700, color: 'rgba(0,0,0,0.65)', letterSpacing: 1 }}>{player.position}</div>
            </div>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '62%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <PosIcon pos={player.position} size={80} />
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 8px 10px', background: 'linear-gradient(180deg,transparent 0%,rgba(0,0,0,0.7) 30%,rgba(0,0,0,0.88) 100%)', zIndex: 2 }}>
              <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 16, fontWeight: 800, color: 'white', textAlign: 'center', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 2 }}>{player.player_name}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 6 }}>{player.team}</div>
              <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 5 }}>
                {stats.map(s => (
                  <div key={s.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1 }}>{s.val}</span>
                    <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>{s.key}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Wave */}
      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: '0 16px', marginTop: -20 }}>

        {/* INFO CARD */}
        <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '20px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 16 }}>ข้อมูลนักกีฬา</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'ชื่อ', value: player.player_name },
              { label: 'ทีม/สโมสร', value: player.team },
              { label: 'จังหวัด', value: player.province },
              { label: 'ตำแหน่ง', value: player.position },
              { label: 'คะแนน', value: `${player.pts.toLocaleString()} pts` },
              { label: 'OVR', value: player.ovr },
            ].map(item => (
              <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontSize: 13, color: '#888', fontWeight: 600 }}>{item.label}</span>
                <span style={{ fontSize: 14, color: '#111', fontWeight: 700 }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* STATS CARD */}
        <div style={{ background: 'white', borderRadius: 16, border: '1.5px solid #e5e5e5', padding: '20px', marginBottom: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', marginBottom: 16 }}>Stats</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {stats.map(s => (
              <div key={s.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#555' }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 14, fontWeight: 700, color: '#111' }}>{s.val}</span>
                </div>
                <div style={{ height: 6, background: '#f0f0f0', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${s.val}%`, background: s.val >= 80 ? '#16a34a' : s.val >= 60 ? '#CC0001' : '#f59e0b', borderRadius: 3, transition: 'width 0.5s ease' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        {[
          { icon: <House size={22} />, label: 'หน้าแรก', href: '/' },
          { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking' },
          { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments' },
          { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile' },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 12px', textDecoration: 'none', color: '#aaa', minWidth: 55 }}>
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: 700 }}>{item.label}</span>
          </Link>
        ))}
      </nav>

    </main>
  )
}