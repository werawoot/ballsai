import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { House, Trophy, ClipboardList, User, MapPin, Calendar, ChevronRight, Zap, Shield, Star } from 'lucide-react'

export default async function Home() {
  const cookieStore = await cookies()
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

  const { data: { user } } = await supabase.auth.getUser()

  const { data: rankings } = await supabase
    .from('player_ranks')
    .select('*')
    .eq('sport', 'football')
    .eq('season', '2026')
    .order('pts', { ascending: false })
    .limit(10)

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('status', 'open')
    .order('start_date', { ascending: true })
    .limit(5)

  const top3 = rankings?.slice(0, 3) ?? []
  const rest = rankings?.slice(3) ?? []

  const cardBg = (rank: number) => {
    if (rank === 1) return {
      bg: 'linear-gradient(160deg,#3d2a00 0%,#c8860a 18%,#f5c518 30%,#c8860a 42%,#7a4f00 55%,#c8860a 70%,#f5c518 82%,#3d2a00 100%)',
      shadow: '0 0 0 2px rgba(245,197,24,0.7),0 10px 30px rgba(200,134,10,0.4)',
      badge: 'linear-gradient(135deg,#f5c518,#c8860a)', badgeColor: '#1a0800'
    }
    if (rank === 2) return {
      bg: 'linear-gradient(160deg,#1a1a1a 0%,#808080 18%,#d0d0d0 30%,#808080 42%,#404040 55%,#808080 70%,#d0d0d0 82%,#1a1a1a 100%)',
      shadow: '0 0 0 2px rgba(200,200,200,0.5),0 8px 20px rgba(100,100,100,0.3)',
      badge: 'linear-gradient(135deg,#d0d0d0,#808080)', badgeColor: '#1a1a1a'
    }
    return {
      bg: 'linear-gradient(160deg,#2a1200 0%,#a0522d 18%,#cd7f32 30%,#a0522d 42%,#4a2000 55%,#a0522d 70%,#cd7f32 82%,#2a1200 100%)',
      shadow: '0 0 0 2px rgba(205,127,50,0.5),0 8px 20px rgba(160,82,45,0.3)',
      badge: 'linear-gradient(135deg,#cd7f32,#6b3a10)', badgeColor: '#fff'
    }
  }

  const PosIcon = ({ pos, size = 48 }: { pos: string, size?: number }) => {
    const style = { width: size, height: size, strokeWidth: 1.5 }
    if (pos === 'GK') return <Shield style={{ ...style, color: 'rgba(255,255,255,0.9)' }} />
    if (pos === 'DF') return <Shield style={{ ...style, color: 'rgba(255,255,255,0.9)' }} />
    if (pos === 'MF') return <Zap style={{ ...style, color: 'rgba(255,255,255,0.9)' }} />
    return <Star style={{ ...style, color: 'rgba(255,255,255,0.9)' }} />
  }

  const orderedTop3 = top3.length === 3
    ? [top3[1], top3[0], top3[2]]
    : top3

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>

      {/* TOPBAR */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0 16px', height: 54,
        background: '#CC0001',
        boxShadow: '0 2px 12px rgba(204,0,1,0.3)'
      }}>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Trophy size={22} strokeWidth={2.5} />
          BALLSAI
        </div>
        {user ? (
          <form action="/auth/signout" method="POST">
            <button style={{ background: 'white', color: '#CC0001', border: 'none', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer', fontFamily: 'var(--font-oswald)', letterSpacing: 1 }}>
              ออกจากระบบ
            </button>
          </form>
        ) : (
          <Link href="/login" style={{ background: 'white', color: '#CC0001', borderRadius: 20, padding: '6px 16px', fontSize: 13, fontWeight: 800, textDecoration: 'none', fontFamily: 'var(--font-oswald)', letterSpacing: 1 }}>
            LOGIN
          </Link>
        )}
      </header>

      {/* HERO */}
      <div style={{ background: '#CC0001', padding: '20px 16px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '4px 12px', marginBottom: 10, position: 'relative' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
          <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'white', textTransform: 'uppercase' }}>LIVE RANKING · SEASON 2026</span>
        </div>
        <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(38px,11vw,64px)', fontWeight: 700, lineHeight: 0.88, textTransform: 'uppercase', color: 'white', position: 'relative' }}>
          THAI YOUTH<br />
          <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>RANKING</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10, position: 'relative' }}>ตารางอันดับนักกีฬาเยาวชนไทย อัปเดตทุกสัปดาห์</p>
        <div style={{ display: 'flex', marginTop: 18, position: 'relative' }}>
          {[['2,841', 'นักกีฬา'], ['77', 'จังหวัด'], [String(tournaments?.length ?? 0), 'รายการแข่ง']].map(([num, label], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 18px', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.2)' : 'none', paddingLeft: i === 0 ? 0 : undefined }}>
              <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 26, fontWeight: 700, color: 'white', lineHeight: 1 }}>{num}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Wave */}
      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      {/* SPORT TABS */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '14px 16px 0', scrollbarWidth: 'none' }}>
        {['⚽ ฟุตบอล', '🏀 บาสเกตบอล', '🏐 วอลเลย์บอล', '🏸 แบดมินตัน'].map((tab, i) => (
          <button key={i} style={{
            flexShrink: 0, padding: '7px 16px', borderRadius: 20,
            border: i === 0 ? 'none' : '1.5px solid #e5e5e5',
            background: i === 0 ? '#CC0001' : 'white',
            color: i === 0 ? 'white' : '#555',
            fontSize: 13, fontWeight: 700,
            opacity: i === 0 ? 1 : 0.4,
            whiteSpace: 'nowrap',
            boxShadow: i === 0 ? '0 4px 12px rgba(204,0,1,0.25)' : 'none',
            fontFamily: 'var(--font-sarabun)', cursor: i === 0 ? 'pointer' : 'default'
          }}>{tab}</button>
        ))}
      </div>

      {/* TOP 3 SECTION HEADER */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
            TOP 3 นักกีฬา
          </div>
          <Link href="/ranking" style={{ fontSize: 12, fontWeight: 700, color: '#CC0001', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
            ดูทั้งหมด <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      {/* TOP 3 CARDS */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, padding: '8px 12px 4px' }}>
        {orderedTop3.map((p, idx) => {
          const rank = idx === 0 ? 2 : idx === 1 ? 1 : 3
          const isFirst = rank === 1
          const s = cardBg(rank)
          return (
            <div key={p.id} style={{ flex: 1, maxWidth: isFirst ? 150 : 130, position: 'relative', marginBottom: isFirst ? 16 : 0 }}>
              {isFirst && (
                <div style={{ position: 'absolute', top: -18, left: '50%', transform: 'translateX(-50%)', zIndex: 10, display: 'flex', justifyContent: 'center' }}>
                  <Trophy size={20} style={{ color: '#f5c518', filter: 'drop-shadow(0 2px 4px rgba(200,134,10,0.6))' }} />
                </div>
              )}
              <div style={{ position: 'absolute', top: -10, right: -8, width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-oswald)', fontSize: 11, fontWeight: 800, zIndex: 10, border: '2px solid #f8f8f8', background: s.badge, color: s.badgeColor }}>#{rank}</div>
              <div style={{ width: '100%', aspectRatio: '2/3', borderRadius: 10, position: 'relative', overflow: 'hidden', background: s.bg, boxShadow: s.shadow }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg,rgba(255,255,255,0.4) 0%,rgba(255,255,255,0) 40%,rgba(255,255,255,0.12) 70%,rgba(255,255,255,0) 100%)' }} />
                <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 2 }}>
                  <div style={{ fontFamily: 'var(--font-oswald)', fontSize: isFirst ? 30 : 26, fontWeight: 800, color: 'rgba(0,0,0,0.75)', lineHeight: 1 }}>{p.ovr}</div>
                  <div style={{ fontFamily: 'var(--font-barlow)', fontSize: 11, fontWeight: 700, color: 'rgba(0,0,0,0.65)', letterSpacing: 1 }}>{p.position}</div>
                </div>
                <div style={{ position: 'absolute', top: 8, right: 6, background: 'rgba(0,0,0,0.35)', borderRadius: 4, padding: '2px 5px', fontSize: 7, fontWeight: 700, color: 'rgba(255,255,255,0.9)', zIndex: 3 }}>{p.province}</div>
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '62%', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
                  <PosIcon pos={p.position} size={isFirst ? 64 : 52} />
                </div>
                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '6px 6px 8px', background: 'linear-gradient(180deg,transparent 0%,rgba(0,0,0,0.7) 30%,rgba(0,0,0,0.88) 100%)', zIndex: 2 }}>
                  <div style={{ fontFamily: 'var(--font-barlow)', fontSize: isFirst ? 14 : 13, fontWeight: 800, color: 'white', textAlign: 'center', textTransform: 'uppercase', lineHeight: 1.1, marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.player_name}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.team}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-around', borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 4 }}>
                    {[['PAC', p.pac], ['SHO', p.sho], ['PAS', p.pas], ['DRI', p.dri], ['DEF', p.def]].map(([key, val]) => (
                      <div key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 11, fontWeight: 700, color: 'white', lineHeight: 1 }}>{val}</span>
                        <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,0.55)' }}>{key}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: 'center', marginTop: 8, fontFamily: 'var(--font-oswald)', fontSize: isFirst ? 15 : 13, fontWeight: 700, color: '#CC0001' }}>
                {p.pts.toLocaleString()} pts
              </div>
            </div>
          )
        })}
      </div>

      {/* RANK 4-10 */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
            อันดับ 4–10
          </div>
          <Link href="/ranking" style={{ fontSize: 12, fontWeight: 700, color: '#CC0001', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
            ดูทั้งหมด <ChevronRight size={14} />
          </Link>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rest.map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'white', borderRadius: 12, border: '1.5px solid #e5e5e5', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', cursor: 'pointer' }}>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 700, color: '#ccc', width: 26, textAlign: 'center', flexShrink: 0 }}>{i + 4}</div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f2f2f2', border: '2px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {p.position === 'GK' || p.position === 'DF'
                  ? <Shield size={20} color="#CC0001" strokeWidth={1.5} />
                  : p.position === 'MF'
                  ? <Zap size={20} color="#CC0001" strokeWidth={1.5} />
                  : <Star size={20} color="#CC0001" strokeWidth={1.5} />
                }
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#111' }}>{p.player_name}</div>
                <div style={{ display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 9, fontWeight: 800, background: '#CC0001', color: 'white', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--font-barlow)', letterSpacing: 0.5 }}>{p.position}</span>
                  <span style={{ fontSize: 11, color: '#888' }}>{p.team}</span>
                  <span style={{ fontSize: 9, fontWeight: 700, color: '#555', background: '#f2f2f2', border: '1px solid #e5e5e5', borderRadius: 4, padding: '1px 6px', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <MapPin size={8} />{p.province}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, color: '#111' }}>{p.pts.toLocaleString()}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.rank_change > 0 ? '#16a34a' : p.rank_change < 0 ? '#CC0001' : '#888' }}>
                  {p.rank_change > 0 ? `▲ ${p.rank_change}` : p.rank_change < 0 ? `▼ ${Math.abs(p.rank_change)}` : '– 0'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* TOURNAMENTS */}
      <div style={{ padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
            รายการแข่งขัน
          </div>
          <Link href="/tournaments" style={{ fontSize: 12, fontWeight: 700, color: '#CC0001', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
            ดูทั้งหมด <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '4px 16px 16px', scrollbarWidth: 'none' }}>
        {tournaments?.map((t) => (
          <Link key={t.id} href={`/tournaments/${t.id}`} style={{ flexShrink: 0, width: 185, background: 'white', border: '1.5px solid #e5e5e5', borderRadius: 14, overflow: 'hidden', textDecoration: 'none', color: 'inherit', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', display: 'block' }}>
            <div style={{ height: 80, background: 'linear-gradient(135deg,#CC0001,#8b0000)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Trophy size={36} color="rgba(255,255,255,0.8)" strokeWidth={1.5} />
            </div>
            <div style={{ padding: '8px 12px 12px' }}>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#16a34a', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                เปิดรับสมัคร
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3, marginBottom: 5, color: '#111' }}>{t.name}</div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <MapPin size={10} /> {t.location}
              </div>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={10} /> {t.start_date}
              </div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001' }}>฿ {t.fee}</div>
            </div>
          </Link>
        ))}
      </div>

      <div style={{ height: 24 }} />

      {/* BOTTOM NAV */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        {[
          { icon: <House size={22} />, label: 'หน้าแรก', href: '/', active: true },
          { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking', active: false },
          { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments', active: false },
          { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile', active: false },
        ].map((item) => (
          <Link key={item.href} href={item.href} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '4px 12px', textDecoration: 'none', color: item.active ? '#CC0001' : '#aaa', minWidth: 55 }}>
            {item.icon}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.3 }}>{item.label}</span>
            {item.active && <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#CC0001' }} />}
          </Link>
        ))}
      </nav>

    </main>
  )
}