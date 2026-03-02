import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Trophy, House, ClipboardList, User, Users, CheckCircle, Clock, Plus, MapPin, Calendar, Image } from 'lucide-react'
import Link from 'next/link'
import ConfirmTeamButton from './ConfirmTeamButton'
import ConfirmPaymentButton from './ConfirmPaymentButton'

export default async function DashboardPage() {
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

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'organizer' && profile?.role !== 'admin') redirect('/')

  const { data: myTournaments } = await supabase
    .from('tournaments')
    .select('*')
    .eq('organizer_id', user.id)
    .order('created_at', { ascending: false })

  const tournamentIds = myTournaments?.map(t => t.id) ?? []

  const { data: allTeams } = await supabase
    .from('teams')
    .select('*, tournaments(name, organizer_id)')
    .in('tournament_id', tournamentIds.length > 0 ? tournamentIds : ['none'])
    .order('created_at', { ascending: false })

  const { data: allPayments } = await supabase
    .from('payments')
    .select('*')
    .in('tournament_id', tournamentIds.length > 0 ? tournamentIds : ['none'])

  const pendingTeams = allTeams?.filter(t => t.status === 'pending') ?? []
  const confirmedTeams = allTeams?.filter(t => t.status === 'confirmed') ?? []

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', paddingBottom: 80, overflowX: 'hidden' }}>

      {/* TOPBAR */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.8)', letterSpacing: 1 }}>ORGANIZER</div>
      </header>

      {/* HERO */}
      <div style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            ORGANIZER<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>DASHBOARD</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>จัดการรายการแข่งขันของคุณ</p>
        </div>
      </div>

      {/* Wave */}
      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <div style={{ padding: '16px' }}>

        {/* STATS */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 20 }}>
          {[
            { icon: <Trophy size={20} color="#CC0001" />, label: 'รายการ', value: myTournaments?.length ?? 0 },
            { icon: <Clock size={20} color="#f59e0b" />, label: 'รอยืนยัน', value: pendingTeams.length },
            { icon: <CheckCircle size={20} color="#16a34a" />, label: 'ยืนยันแล้ว', value: confirmedTeams.length },
          ].map((s, i) => (
            <div key={i} style={{ background: 'white', borderRadius: 12, border: '1.5px solid #e5e5e5', padding: '14px 10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 700, color: '#111', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: '#aaa', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* MY TOURNAMENTS */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 4, height: 20, background: '#CC0001', borderRadius: 2 }} />
              รายการของฉัน
            </div>
            <Link href="/dashboard/create" style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#CC0001', color: 'white', borderRadius: 20, padding: '6px 14px', fontSize: 12, fontWeight: 800, textDecoration: 'none', fontFamily: 'var(--font-oswald)', letterSpacing: 0.5 }}>
              <Plus size={14} /> สร้างรายการ
            </Link>
          </div>

          {myTournaments && myTournaments.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myTournaments.map(t => {
                const tTeams = allTeams?.filter(team => team.tournament_id === t.id) ?? []
                const tPending = tTeams.filter(team => team.status === 'pending').length
                return (
                  <div key={t.id} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ height: 5, background: 'linear-gradient(90deg,#CC0001,#ff4444)' }} />
                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 6 }}>{t.name}</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
                              <MapPin size={12} color="#CC0001" /> {t.location}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#555' }}>
                              <Calendar size={12} color="#CC0001" /> {t.start_date}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                          <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 18, fontWeight: 700, color: '#CC0001' }}>฿{t.fee}</div>
                          {tPending > 0 && (
                            <div style={{ background: '#fef9c3', color: '#854d0e', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>
                              {tPending} รอยืนยัน
                            </div>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#f8f8f8', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, color: '#555' }}>
                        <Users size={14} color="#aaa" /> {tTeams.length} ทีม
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: '32px', textAlign: 'center' }}>
              <Trophy size={40} color="#ddd" strokeWidth={1} style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: '#aaa' }}>ยังไม่มีรายการแข่งขัน</p>
              <Link href="/dashboard/create" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: '#CC0001', color: 'white', borderRadius: 20, padding: '8px 20px', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                <Plus size={14} /> สร้างรายการแรก
              </Link>
            </div>
          )}
        </div>

        {/* PENDING TEAMS */}
        {pendingTeams.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 20, background: '#f59e0b', borderRadius: 2 }} />
              รอการยืนยัน ({pendingTeams.length})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingTeams.map(team => {
                const payment = allPayments?.find(p => p.team_id === team.id)
                return (
                  <div key={team.id} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ height: 4, background: '#f59e0b' }} />
                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: '#111', marginBottom: 3 }}>{team.name}</div>
                          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>{team.tournaments?.name}</div>
                          <div style={{ fontSize: 12, color: '#aaa', lineHeight: 1.6 }}>{team.members}</div>
                        </div>
                        <div style={{ background: '#fef9c3', color: '#854d0e', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>
                          รอยืนยัน
                        </div>
                      </div>

                      {/* PAYMENT SLIP */}
                      {payment ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#555', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <Image size={13} /> หลักฐานการชำระเงิน
                          </div>
                          <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '10px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: '#888' }}>ยอดชำระ</span>
                              <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, color: '#CC0001' }}>฿{payment.amount?.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: '#888' }}>สถานะ</span>
                              <span style={{ fontSize: 11, fontWeight: 800, background: payment.status === 'confirmed' ? '#dcfce7' : '#fef9c3', color: payment.status === 'confirmed' ? '#16a34a' : '#854d0e', padding: '2px 8px', borderRadius: 20 }}>
                                {payment.status === 'confirmed' ? '✓ ยืนยันแล้ว' : '⏳ รอตรวจสอบ'}
                              </span>
                            </div>
                          </div>

                          {payment.slip_url && (
                            <a href={payment.slip_url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: '1.5px solid #e5e5e5' }}>
                              <img src={payment.slip_url} alt="slip" style={{ width: '100%', maxHeight: 200, objectFit: 'contain', display: 'block', background: '#f8f8f8' }} />
                              <div style={{ background: '#f8f8f8', padding: '6px', textAlign: 'center', fontSize: 11, color: '#888', fontWeight: 600 }}>
                                แตะเพื่อดูรูปขนาดเต็ม
                              </div>
                            </a>
                          )}

                          {payment.status === 'pending' && (
                            <div style={{ marginTop: 10 }}>
                              <ConfirmPaymentButton paymentId={payment.id} teamId={team.id} />
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ background: '#f8f8f8', borderRadius: 10, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                          <p style={{ fontSize: 12, color: '#aaa', fontWeight: 600 }}>⏳ ยังไม่ได้อัปโหลดสลิป</p>
                        </div>
                      )}

                      <div style={{ display: 'flex', gap: 8 }}>
                        <ConfirmTeamButton teamId={team.id} action="confirmed" />
                        <ConfirmTeamButton teamId={team.id} action="rejected" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* BOTTOM NAV */}
      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1.5px solid #e5e5e5', display: 'flex', justifyContent: 'space-around', padding: '6px 0', zIndex: 100, boxShadow: '0 -4px 20px rgba(0,0,0,0.06)' }}>
        {[
          { icon: <House size={22} />, label: 'หน้าแรก', href: '/', active: false },
          { icon: <Trophy size={22} />, label: 'Ranking', href: '/ranking', active: false },
          { icon: <ClipboardList size={22} />, label: 'รายการแข่ง', href: '/tournaments', active: false },
          { icon: <User size={22} />, label: 'โปรไฟล์', href: '/profile', active: false },
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