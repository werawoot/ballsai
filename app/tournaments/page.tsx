import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import Link from 'next/link'
import { Trophy, MapPin, Calendar, ChevronRight, House, ClipboardList, User } from 'lucide-react'

export default async function TournamentsPage() {
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

  const { data: tournaments } = await supabase
    .from('tournaments')
    .select('*')
    .order('start_date', { ascending: true })

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>

      {/* TOPBAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
      </header>

      {/* HERO */}
      <div style={{ background: '#CC0001', padding: '20px 16px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 20, padding: '4px 12px', marginBottom: 10 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'white' }} />
            <span style={{ fontFamily: 'var(--font-barlow)', fontSize: 11, fontWeight: 700, letterSpacing: 2, color: 'white', textTransform: 'uppercase' }}>OPEN · SEASON 2026</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(32px,9vw,52px)', fontWeight: 700, lineHeight: 0.9, textTransform: 'uppercase', color: 'white' }}>
            รายการ<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>แข่งขัน</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>รายการบอลเดินสายทั้งหมดที่เปิดรับสมัคร</p>
        </div>
      </div>

      {/* Wave */}
      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      {/* LIST */}
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {tournaments && tournaments.length > 0 ? tournaments.map((t) => (
            <div key={t.id} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              {/* Card top bar */}
              <div style={{ height: 6, background: 'linear-gradient(90deg,#CC0001,#ff4444)' }} />
              <div style={{ padding: '14px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 800, color: '#16a34a', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#16a34a' }} />
                      เปิดรับสมัคร
                    </div>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111', marginBottom: 10, lineHeight: 1.3 }}>{t.name}</h2>
                    <p style={{ fontSize: 13, color: '#888', marginBottom: 10 }}>{t.description}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
                        <MapPin size={13} color="#CC0001" /> {t.location}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
                        <Calendar size={13} color="#CC0001" /> {t.start_date}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
                    <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 20, fontWeight: 700, color: '#CC0001' }}>฿{t.fee}</div>
                  </div>
                </div>
                <Link href={`/tournaments/${t.id}`} style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#CC0001', color: 'white', borderRadius: 10, padding: '11px', fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-oswald)', letterSpacing: 0.5, textDecoration: 'none' }}>
                  ดูรายละเอียด <ChevronRight size={16} />
                </Link>
              </div>
            </div>
          )) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#aaa' }}>
              <Trophy size={48} color="#ddd" strokeWidth={1} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 15, fontWeight: 600 }}>ยังไม่มีรายการแข่งขัน</p>
            </div>
          )}
        </div>
      </div>

      <div style={{ height: 24 }} />

      {/* BOTTOM NAV */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        {[
          { icon: <House size={22} />, label: 'หน้าแรก', href: '/', active: false },
          { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking', active: false },
          { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments', active: true },
          { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile', active: false },
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