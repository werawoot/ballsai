import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Trophy, Users, CheckCircle, Clock, Plus, MapPin, Calendar, Image as ImageIcon, ClipboardCheck, Pencil, ClipboardPenLine, GitBranch } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import Image from 'next/image'
import ConfirmTeamButton from './ConfirmTeamButton'
import ConfirmPaymentButton from './ConfirmPaymentButton'
import { approvalAction } from '@/lib/team-approval'
import NotOrganizer from '@/components/NotOrganizer'
import ToggleTournamentStatusButton from './ToggleTournamentStatusButton'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { parsePage } from '@/lib/pagination'
import { fetchOrganizerDashboard } from '@/lib/organizer-dashboard'

export default async function DashboardPage(props: { searchParams?: Promise<{ page?: string; pending?: string }> }) {
  const tl = await getTranslations('labels')
  const searchParams = (await props.searchParams) ?? {}
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
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'organizer' && profile?.role !== 'admin') return <NotOrganizer />

  // Tournaments and the approval queue are paged separately (?page= and ?pending=), so the
  // page stays the same size however many tournaments an organizer runs over the years.
  const tournamentsPage = parsePage(searchParams.page)
  const pendingPage = parsePage(searchParams.pending)
  const { stats, tournaments: myTournaments, tournamentsHasNext, teamCounts, pendingTeams, pendingHasNext, paymentsByTeam } =
    await fetchOrganizerDashboard(supabase, { organizerId: user.id, tournamentsPage, pendingPage })
  const fixturesText = await getTranslations('fixtures')

  return (
    <main className="bds-page ui-matchday" style={{ minHeight: '100vh', overflowX: 'hidden' }}>

      {/* TOPBAR */}
      <PageHeader eyebrow={tl('dashboardLabels.eyebrow')} />

      {/* HERO */}
      <div className="bds-hero" style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            {tl('dashboardLabels.heroTop')}<br />
            <span style={{ color: '#ffd84d' }}>{tl('dashboardLabels.eyebrow')}</span>
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
            { icon: <Trophy size={20} color="#CC0001" />, label: 'รายการ', value: stats.tournaments },
            { icon: <Clock size={20} color="#f59e0b" />, label: 'รอยืนยัน', value: stats.pending },
            { icon: <CheckCircle size={20} color="#16a34a" />, label: 'ยืนยันแล้ว', value: stats.confirmed },
          ].map((s, i) => (
            <div key={i} style={{ background: 'var(--ui-card)', borderRadius: 12, border: '1.5px solid var(--ui-line)', padding: '14px 10px', textAlign: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>{s.icon}</div>
              <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 700, color: 'var(--ui-text)', lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--ui-mute)', marginTop: 3 }}>{s.label}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
          <Link href="/match-plan" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#101827', color: 'white', borderRadius: 12, padding: '13px 10px', fontSize: 13, fontWeight: 800, textDecoration: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.18)' }}>
            <ClipboardPenLine size={17} /> วางแผนก่อนแข่ง
          </Link>
          <Link href="/dashboard/results" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, background: '#CC0001', color: 'white', borderRadius: 12, padding: '13px 10px', fontSize: 13, fontWeight: 800, textDecoration: 'none', boxShadow: '0 4px 16px rgba(204,0,1,.2)' }}>
            <ClipboardCheck size={17} /> บันทึกผลแข่ง
          </Link>
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

          {stats.tournaments > 0 || tournamentsPage > 1 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {myTournaments.map(t => {
                const { total: tTeamCount, pending: tPending } = teamCounts[t.id] ?? { total: 0, pending: 0 }
                return (
                  <div key={t.id} style={{ background: 'var(--ui-card)', borderRadius: 14, border: '1.5px solid var(--ui-line)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ height: 5, background: 'linear-gradient(90deg,#CC0001,#ff4444)' }} />
                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h3 style={{ fontSize: 15, fontWeight: 800, color: 'var(--ui-text)', marginBottom: 6 }}>{t.name}</h3>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ui-mute)' }}>
                              <MapPin size={12} color="#CC0001" /> {t.location}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ui-mute)' }}>
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
                          <div style={{ background: t.status === 'open' ? 'var(--ui-sunk)' : 'var(--ui-sunk)', color: t.status === 'open' ? '#166534' : '#991b1b', fontSize: 10, fontWeight: 800, padding: '3px 8px', borderRadius: 20 }}>
                            {t.status === 'open' ? 'เปิดรับสมัคร' : 'ปิดรับสมัคร'}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--ui-sunk)', borderRadius: 8, padding: '8px 10px', fontSize: 12, fontWeight: 700, color: 'var(--ui-mute)' }}>
                        <Users size={14} color="#aaa" /> {tTeamCount} ทีม
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                        <Link href={`/dashboard/tournaments/${t.id}/edit`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#CC0001', color: 'white', borderRadius: 10, padding: '9px 10px', fontSize: 12, fontWeight: 800, textDecoration: 'none', fontFamily: 'var(--font-oswald)' }}>
                          <Pencil size={14} /> แก้ไข
                        </Link>
                        <Link href={`/dashboard/tournaments/${t.id}/fixtures`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: '#111827', color: 'white', borderRadius: 10, padding: '9px 10px', minHeight: 44, boxSizing: 'border-box', fontSize: 12, fontWeight: 800, textDecoration: 'none', fontFamily: 'var(--font-oswald)' }}>
                          <GitBranch size={14} /> {fixturesText('open')}
                        </Link>
                        <ToggleTournamentStatusButton tournamentId={t.id} status={t.status} />
                      </div>
                    </div>
                  </div>
                )
              })}
              <Pagination basePath="/dashboard" page={tournamentsPage} hasNext={tournamentsHasNext} params={{ pending: pendingPage > 1 ? String(pendingPage) : '' }} />
            </div>
          ) : (
            <div style={{ background: 'var(--ui-card)', borderRadius: 14, border: '1.5px solid var(--ui-line)', padding: '32px', textAlign: 'center' }}>
              <Trophy size={40} color="#ddd" strokeWidth={1} style={{ marginBottom: 10 }} />
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--ui-mute)' }}>ยังไม่มีรายการแข่งขัน</p>
              <Link href="/dashboard/create" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, background: '#CC0001', color: 'white', borderRadius: 20, padding: '8px 20px', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>
                <Plus size={14} /> สร้างรายการแรก
              </Link>
            </div>
          )}
        </div>

        {/* An empty queue still says where submitted teams will appear (Claude Desktop test, 8 Oct). */}
        {stats.pending === 0 && pendingPage === 1 && (
          <div role="status" style={{ background: 'var(--ui-card)', borderRadius: 14, border: '1.5px dashed var(--ui-line)', padding: '16px 14px', marginBottom: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--ui-text)', marginBottom: 4 }}>{tl('dashboardLabels.noPendingTitle')}</div>
            <p style={{ fontSize: 12, color: 'var(--ui-mute)', margin: 0, lineHeight: 1.6 }}>{tl('dashboardLabels.noPendingText')}</p>
          </div>
        )}

        {/* PENDING TEAMS */}
        {/* Shown by the total, not this page's rows: a page emptied by approvals keeps its way back. */}
        {(stats.pending > 0 || pendingPage > 1) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontFamily: 'var(--font-oswald)', fontSize: 17, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 4, height: 20, background: '#f59e0b', borderRadius: 2 }} />
              รอการยืนยัน ({stats.pending})
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingTeams.map(team => {
                const payment = paymentsByTeam[team.id]
                const action = approvalAction(team.tournaments?.fee, payment ?? null)
                return (
                  <div key={team.id} style={{ background: 'var(--ui-card)', borderRadius: 14, border: '1.5px solid var(--ui-line)', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
                    <div style={{ height: 4, background: '#f59e0b' }} />
                    <div style={{ padding: '14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ui-text)', marginBottom: 3 }}>{team.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--ui-mute)', marginBottom: 4 }}>{team.tournaments?.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--ui-mute)', lineHeight: 1.6 }}>{team.members}</div>
                        </div>
                        <div style={{ background: '#fef9c3', color: '#854d0e', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, flexShrink: 0 }}>
                          รอยืนยัน
                        </div>
                      </div>

                      {/* PAYMENT SLIP */}
                      {payment ? (
                        <div style={{ marginBottom: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ui-mute)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 4 }}>
                            <ImageIcon size={13} /> หลักฐานการชำระเงิน
                          </div>
                          <div style={{ background: 'var(--ui-sunk)', borderRadius: 10, padding: '10px', marginBottom: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                              <span style={{ fontSize: 12, color: 'var(--ui-mute)' }}>ยอดชำระ</span>
                              <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, fontWeight: 700, color: '#CC0001' }}>฿{payment.amount?.toLocaleString()}</span>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: 12, color: 'var(--ui-mute)' }}>สถานะ</span>
                              <span style={{ fontSize: 11, fontWeight: 800, background: payment.status === 'confirmed' ? 'var(--ui-sunk)' : '#fef9c3', color: payment.status === 'confirmed' ? '#16a34a' : '#854d0e', padding: '2px 8px', borderRadius: 20 }}>
                                {payment.status === 'confirmed' ? '✓ ยืนยันแล้ว' : '⏳ รอตรวจสอบ'}
                              </span>
                            </div>
                          </div>

                          {payment.slip_url && (
                            <a href={`/api/payments/${payment.id}/slip`} target="_blank" rel="noopener noreferrer" style={{ display: 'block', borderRadius: 10, overflow: 'hidden', border: '1.5px solid var(--ui-line)' }}>
                              <Image src={`/api/payments/${payment.id}/slip`} alt="slip" width={640} height={900} unoptimized style={{ width: '100%', maxHeight: 140, height: 'auto', objectFit: 'contain', display: 'block', background: 'var(--ui-sunk)' }} />
                              <div style={{ background: 'var(--ui-sunk)', padding: '6px', textAlign: 'center', fontSize: 11, color: 'var(--ui-mute)', fontWeight: 600 }}>
                                แตะเพื่อดูรูปขนาดเต็ม
                              </div>
                            </a>
                          )}

                        </div>
                      ) : (
                        <div style={{ background: 'var(--ui-sunk)', borderRadius: 10, padding: '12px', marginBottom: 12, textAlign: 'center' }}>
                          <p style={{ fontSize: 12, color: 'var(--ui-mute)', fontWeight: 600 }}>{action === 'confirmTeam' ? tl('dashboardLabels.freeNoSlip') : '⏳ ยังไม่ได้อัปโหลดสลิป'}</p>
                        </div>
                      )}

                      <div style={{ display: 'grid', gap: 8 }}>
                        {action === 'confirmPayment' && payment && <ConfirmPaymentButton paymentId={payment.id} />}
                        {action === 'confirmTeam' && <ConfirmTeamButton teamId={team.id} action="confirmed" />}
                        <ConfirmTeamButton teamId={team.id} action="rejected" />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
            <Pagination basePath="/dashboard" page={pendingPage} hasNext={pendingHasNext} pageParam="pending" params={{ page: tournamentsPage > 1 ? String(tournamentsPage) : '' }} />
          </div>
        )}

      </div>


    </main>
  )
}
