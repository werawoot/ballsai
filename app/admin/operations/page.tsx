import Link from 'next/link'
import { Activity, ArrowLeft, Building2, CalendarDays, ClipboardCheck, Database, Eye, FileWarning, Handshake, HeartHandshake, Landmark, LockKeyhole, Mail, ShieldCheck, UserMinus, UsersRound } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Tone = 'green' | 'amber' | 'red' | 'navy'
const tones: Record<Tone, { bg: string; border: string; text: string }> = {
  green: { bg: '#ecfdf3', border: '#b7ebc7', text: '#087443' }, amber: { bg: '#fff8e8', border: '#f0d899', text: '#955f00' }, red: { bg: '#fff1f1', border: '#fecaca', text: '#b42318' }, navy: { bg: '#eef3fa', border: '#cfd9e8', text: '#17355c' },
}

function Metric({ icon, value, title, detail, tone = 'navy' }: { icon: React.ReactNode; value: number; title: string; detail: string; tone?: Tone }) {
  const c = tones[tone]
  return <article style={{ background: '#fff', border: '1px solid #e4e8ee', borderRadius: 14, boxShadow: '0 6px 20px rgba(17,24,39,.045)', padding: 15 }}><div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between' }}><span style={{ alignItems: 'center', background: c.bg, border: `1px solid ${c.border}`, borderRadius: 9, color: c.text, display: 'inline-flex', height: 35, justifyContent: 'center', width: 35 }}>{icon}</span><b style={{ color: c.text, font: '800 30px/1 var(--font-oswald)' }}>{value}</b></div><b style={{ color: '#172033', display: 'block', fontSize: 13, marginTop: 11 }}>{title}</b><small style={{ color: '#728094', display: 'block', fontSize: 11, marginTop: 3 }}>{detail}</small></article>
}

function Queue({ icon, title, count, detail, href, tone }: { icon: React.ReactNode; title: string; count: number; detail: string; href: string; tone: Tone }) {
  const c = tones[tone]
  return <Link href={href} style={{ alignItems: 'center', background: '#fff', border: '1px solid #e5e8ed', borderLeft: `4px solid ${c.text}`, borderRadius: 11, color: '#172033', display: 'grid', gap: 10, gridTemplateColumns: '32px minmax(0,1fr) auto', padding: 12, textDecoration: 'none' }}><span style={{ color: c.text }}>{icon}</span><span><b style={{ display: 'block', fontSize: 13 }}>{title}</b><small style={{ color: '#728094', display: 'block', fontSize: 11, lineHeight: 1.35, marginTop: 2 }}>{detail}</small></span><b style={{ background: c.bg, borderRadius: 99, color: c.text, font: '800 18px/1 var(--font-oswald)', padding: '6px 9px' }}>{count}</b></Link>
}

function Tool({ href, icon, title, detail }: { href: string; icon: React.ReactNode; title: string; detail: string }) {
  return <Link href={href} style={{ background: '#111b2a', border: '1px solid rgba(255,255,255,.11)', borderRadius: 11, color: 'white', padding: 13, textDecoration: 'none' }}><span style={{ color: '#f5c518' }}>{icon}</span><b style={{ display: 'block', fontSize: 13, marginTop: 7 }}>{title}</b><small style={{ color: 'rgba(255,255,255,.62)', display: 'block', fontSize: 11, marginTop: 2 }}>{detail}</small></Link>
}

export default async function OperationsPage() {
  const s = await createServerSupabaseClient()
  const [summaryResult, slips] = await Promise.all([
    s.rpc('get_admin_command_center_summary'),
    s.storage.getBucket('slips'),
  ])
  const summary = !summaryResult.error && summaryResult.data && typeof summaryResult.data === 'object'
    ? summaryResult.data as Record<string, unknown>
    : null
  const summaryNumber = (key: string) => Number.isFinite(Number(summary?.[key])) ? Number(summary?.[key]) : 0
  const asCount = (count: number) => ({ count, error: null })
  const fallback = summary ? null : await Promise.all([
    s.from('profiles').select('id', { count: 'exact', head: true }), s.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['admin', 'organizer']), s.from('tournaments').select('id', { count: 'exact', head: true }), s.from('teams').select('id', { count: 'exact', head: true }).eq('status', 'pending'), s.from('payments').select('id', { count: 'exact', head: true }).neq('status', 'confirmed'), s.from('match_results').select('id', { count: 'exact', head: true }), s.from('athlete_highlight_reports').select('id', { count: 'exact', head: true }).is('resolved_at', null), s.from('account_deletion_requests').select('id', { count: 'exact', head: true }).is('completed_at', null), s.from('guardian_links').select('id', { count: 'exact', head: true }).eq('status', 'pending'), s.from('venue_booking_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'), s.from('organization_members').select('id', { count: 'exact', head: true }).eq('status', 'pending'), s.from('sponsorship_interests').select('id', { count: 'exact', head: true }).eq('status', 'submitted'), s.from('venue_profiles').select('id', { count: 'exact', head: true }), s.from('organizations').select('id', { count: 'exact', head: true }),
  ])
  const [profiles, managers, tournaments, teams, payments, results, reports, deletions, guardians, bookings, invites, interests, venues, organizations] = fallback ?? [
    asCount(summaryNumber('profiles')), asCount(summaryNumber('managers')), asCount(summaryNumber('tournaments')),
    asCount(summaryNumber('pending_teams')), asCount(summaryNumber('pending_payments')), asCount(summaryNumber('results')),
    asCount(summaryNumber('open_highlight_reports')), asCount(summaryNumber('open_deletion_requests')),
    asCount(summaryNumber('pending_guardian_links')), asCount(summaryNumber('pending_venue_bookings')),
    asCount(summaryNumber('pending_organization_invites')), asCount(summaryNumber('submitted_sponsor_interests')),
    asCount(summaryNumber('venues')), asCount(summaryNumber('organizations')),
  ]
  const n = (r: { count: number | null; error: unknown }) => r.error ? 0 : r.count ?? 0
  const slipsPrivate = !slips.error && slips.data?.public === false
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
  const rateLimitReady = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  const attention = n(teams) + n(payments) + n(reports) + n(deletions) + n(guardians) + n(bookings) + n(invites) + n(interests)

  return <main style={{ background: '#f4f6f8', minHeight: '100vh', paddingBottom: 56 }}>
    <header style={{ alignItems: 'center', background: '#0c1421', color: 'white', display: 'flex', justifyContent: 'space-between', padding: '13px clamp(16px,5vw,64px)' }}><Link href="/admin" style={{ alignItems: 'center', color: 'white', display: 'inline-flex', fontSize: 13, fontWeight: 800, gap: 7, textDecoration: 'none' }}><ArrowLeft size={17} /> Admin Panel</Link><span style={{ color: '#f5c518', font: '800 11px var(--font-oswald)', letterSpacing: 1.4 }}>SYSTEM CONTROL CENTER</span></header>
    <section style={{ background: 'linear-gradient(118deg,#0c1421 0%,#142d44 63%,#4b2111 100%)', color: 'white', padding: '30px clamp(16px,5vw,64px) 35px' }}><div style={{ margin: '0 auto', maxWidth: 1140 }}><p style={{ color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.5, margin: 0 }}>CLOSED BETA COMMAND DESK</p><div style={{ alignItems: 'end', display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'space-between' }}><div><h1 style={{ font: '800 clamp(35px,6vw,60px)/.9 var(--font-oswald)', margin: '9px 0' }}>SEE THE WHOLE<br /><span style={{ color: '#f5c518' }}>PLAYING FIELD.</span></h1><p style={{ color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: 1.5, margin: 0, maxWidth: 590 }}>ภาพรวม Closed Beta ในหน้าเดียว ใช้เฉพาะตัวเลขสรุปโดยไม่เปิดข้อมูลติดต่อหรือโน้ตส่วนตัวของเด็ก</p></div><div style={{ background: attention ? '#4a260e' : '#103c2c', border: `1px solid ${attention ? '#a7682e' : '#237956'}`, borderRadius: 12, minWidth: 142, padding: '12px 14px' }}><span style={{ color: 'rgba(255,255,255,.7)', fontSize: 11 }}>คิวที่ต้องดู</span><b style={{ color: '#f5c518', display: 'block', font: '800 40px/1 var(--font-oswald)', marginTop: 4 }}>{attention}</b></div></div></div></section>
    <section style={{ margin: '0 auto', maxWidth: 1140, padding: '22px 16px' }}>
      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))' }}><Metric icon={<UsersRound size={18} />} value={n(profiles)} title="บัญชีในระบบ" detail={`${n(managers)} admin / organizer`} /><Metric icon={<CalendarDays size={18} />} value={n(tournaments)} title="รายการแข่งขัน" detail={`${n(results)} ผลที่บันทึกแล้ว`} /><Metric icon={<Building2 size={18} />} value={n(venues)} title="สนาม" detail={`${n(organizations)} Academy / Club`} /><Metric icon={<Handshake size={18} />} value={n(interests)} title="Sponsor interest" detail="รอแบรนด์ตรวจ" tone={n(interests) ? 'amber' : 'green'} /></div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.15fr) minmax(280px,.85fr)', marginTop: 18 }}>
        <section style={{ background: '#fff', border: '1px solid #e1e6ec', borderRadius: 15, padding: 17 }}><p style={{ color: '#cc0001', font: '800 10px var(--font-oswald)', letterSpacing: 1.2, margin: 0 }}>ACTION QUEUE</p><h2 style={{ color: '#172033', fontSize: 21, margin: '3px 0 13px' }}>สิ่งที่ต้องตัดสินใจ</h2><div style={{ display: 'grid', gap: 8 }}><Queue icon={<ClipboardCheck size={18} />} title="ทีมและสลิปรอตรวจ" count={n(teams) + n(payments)} detail="ตรวจทีมและหลักฐานชำระเงิน" href="/dashboard" tone={n(teams) + n(payments) ? 'amber' : 'green'} /><Queue icon={<FileWarning size={18} />} title="รายงาน Highlight" count={n(reports)} detail="เนื้อหาที่ต้องตรวจโดยผู้ดูแล" href="/admin/moderation" tone={n(reports) ? 'red' : 'green'} /><Queue icon={<HeartHandshake size={18} />} title="Guardian / Organization invites" count={n(guardians) + n(invites)} detail="คำเชื่อมผู้ปกครองและคำเชิญองค์กร" href="/guardian" tone={n(guardians) + n(invites) ? 'amber' : 'green'} /><Queue icon={<Landmark size={18} />} title="คำขอจองสนาม" count={n(bookings)} detail="คำขอที่เจ้าของสนามต้องตอบ" href="/venues/bookings" tone={n(bookings) ? 'amber' : 'green'} /><Queue icon={<UserMinus size={18} />} title="คำขอลบข้อมูล" count={n(deletions)} detail="ต้องปิด Auth account เป็นขั้นตอนสุดท้าย" href="/admin/operations" tone={n(deletions) ? 'red' : 'green'} /></div></section>
        <aside style={{ display: 'grid', gap: 12, height: 'fit-content' }}><section style={{ background: '#fff', border: '1px solid #e1e6ec', borderRadius: 15, padding: 17 }}><p style={{ color: '#cc0001', font: '800 10px var(--font-oswald)', letterSpacing: 1.2, margin: 0 }}>BETA READINESS</p><h2 style={{ color: '#172033', fontSize: 21, margin: '3px 0 13px' }}>Safety signals</h2><div style={{ display: 'grid', gap: 8 }}><Queue icon={<LockKeyhole size={17} />} title="Payment slips" count={slipsPrivate ? 0 : 1} detail={slipsPrivate ? 'Private bucket + signed URL' : 'ตรวจ Storage bucket'} href="/admin/operations" tone={slipsPrivate ? 'green' : 'red'} /><Queue icon={<Mail size={17} />} title="Transactional email" count={emailReady ? 0 : 1} detail={emailReady ? 'Sender พร้อมใช้งาน' : 'ต้องตั้ง Resend sender'} href="/admin/operations" tone={emailReady ? 'green' : 'amber'} /><Queue icon={<ShieldCheck size={17} />} title="Rate limiting" count={rateLimitReady ? 0 : 1} detail={rateLimitReady ? 'Redis shared limit พร้อม' : 'ใช้ memory fallback'} href="/admin/operations" tone={rateLimitReady ? 'green' : 'amber'} /></div></section><section style={{ background: '#111b2a', borderRadius: 15, padding: 17 }}><p style={{ color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.2, margin: 0 }}>CONTROL ROOM</p><h2 style={{ color: 'white', fontSize: 21, margin: '3px 0 13px' }}>เครื่องมือผู้ดูแล</h2><div style={{ display: 'grid', gap: 8, gridTemplateColumns: '1fr 1fr' }}><Tool href="/admin" icon={<Activity size={18} />} title="Rankings" detail="Power Rating" /><Tool href="/dashboard/results" icon={<ClipboardCheck size={18} />} title="Results" detail="บันทึกผลแข่ง" /><Tool href="/admin/moderation" icon={<Eye size={18} />} title="Moderation" detail="Highlight reports" /><Tool href="/admin/infrastructure" icon={<Database size={18} />} title="Infrastructure" detail="ข้อมูลพื้นฐาน" /></div></section></aside>
      </div><p style={{ color: '#778397', fontSize: 11, lineHeight: 1.55, margin: '15px 2px 0' }}>{summary ? 'ใช้ Admin summary RPC: คิวงานเป็นค่าจริง ส่วนยอดสะสมขนาดใหญ่เป็นค่าประมาณจากสถิติฐานข้อมูล' : 'ใช้โหมด compatibility จนกว่าจะอนุมัติ SQL34; ค่า 0 อาจหมายถึงยังไม่มีข้อมูล Closed Beta ไม่ใช่ความผิดพลาดของระบบ'}</p>
    </section>
  </main>
}
