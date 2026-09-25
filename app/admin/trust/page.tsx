import Link from 'next/link'
import { AlertTriangle, ArrowLeft, BadgeCheck, Eye, FileCheck2, Scale, ShieldAlert } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type CountResult = { count: number | null; error: { code?: string } | null }

function Metric({ value, label, note, tone = 'navy' }: { value: number; label: string; note: string; tone?: 'navy' | 'amber' | 'red' | 'green' }) {
  const palette = {
    navy: ['#eef3fb', '#20406c'], amber: ['#fff7e4', '#8b5900'], red: ['#fff0f0', '#a51d25'], green: ['#effaf2', '#087443'],
  }[tone]
  return <article style={{ background: '#fff', border: '1px solid #e4e8ee', borderRadius: 13, padding: 15 }}><b style={{ color: palette[1], display: 'block', font: '800 34px/1 var(--font-oswald)' }}>{value}</b><span style={{ color: '#182334', display: 'block', fontSize: 13, fontWeight: 800, marginTop: 9 }}>{label}</span><small style={{ color: '#768398', display: 'block', fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>{note}</small></article>
}

function WorkItem({ icon, title, body, href, state }: { icon: React.ReactNode; title: string; body: string; href: string; state: string }) {
  return <Link href={href} style={{ alignItems: 'center', background: '#fff', border: '1px solid #e1e5ea', borderLeft: '4px solid #cc0001', borderRadius: 10, color: '#172033', display: 'grid', gap: 12, gridTemplateColumns: '34px minmax(0,1fr) auto', padding: 13, textDecoration: 'none' }}><span style={{ color: '#cc0001' }}>{icon}</span><span><b style={{ display: 'block', fontSize: 13 }}>{title}</b><small style={{ color: '#68768a', display: 'block', fontSize: 11, lineHeight: 1.45, marginTop: 3 }}>{body}</small></span><span style={{ background: '#fff4d8', borderRadius: 999, color: '#8b5900', fontSize: 10, fontWeight: 800, padding: '5px 7px', textAlign: 'center' }}>{state}</span></Link>
}

export default async function AdminTrustPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/admin/trust')
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') redirect('/')

  const [provenance, evidence, disputes, anomalies, explanations] = await Promise.all([
    supabase.from('data_provenance').select('id', { count: 'exact', head: true }),
    supabase.from('verification_evidence').select('id', { count: 'exact', head: true }).eq('review_status', 'pending'),
    supabase.from('data_disputes').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_review']),
    supabase.from('data_anomaly_flags').select('id', { count: 'exact', head: true }).in('status', ['open', 'acknowledged']),
    supabase.from('rank_explanations').select('id', { count: 'exact', head: true }),
  ]) as CountResult[]
  const schemaReady = [provenance, evidence, disputes, anomalies, explanations].every(result => !result.error)
  const count = (result: CountResult) => result.error ? 0 : result.count ?? 0

  return <main style={{ background: '#f3f5f7', minHeight: '100vh', paddingBottom: 64 }}>
    <header style={{ alignItems: 'center', background: '#0d1725', color: 'white', display: 'flex', justifyContent: 'space-between', padding: '13px clamp(16px,5vw,64px)' }}><Link href="/admin" style={{ alignItems: 'center', color: 'white', display: 'inline-flex', fontSize: 13, fontWeight: 800, gap: 7, textDecoration: 'none' }}><ArrowLeft size={17} /> Admin Panel</Link><span style={{ color: '#f5c518', font: '800 11px var(--font-oswald)', letterSpacing: 1.4 }}>TRUST &amp; INTEGRITY DESK</span></header>
    <section style={{ background: 'linear-gradient(120deg,#0d1725,#173a50 62%,#54230d)', color: 'white', padding: '34px clamp(16px,5vw,64px) 42px' }}><div style={{ margin: '0 auto', maxWidth: 1080 }}><p style={{ color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.7, margin: 0 }}>OFFICIAL RECORDS · CLOSED BETA</p><h1 style={{ font: '800 clamp(38px,7vw,66px)/.87 var(--font-oswald)', margin: '10px 0' }}>KEEP THE GAME<br /><span style={{ color: '#f5c518' }}>CREDIBLE.</span></h1><p style={{ color: 'rgba(255,255,255,.72)', fontSize: 13, lineHeight: 1.55, margin: 0, maxWidth: 590 }}>ตรวจหลักฐาน, ข้อโต้แย้ง และสัญญาณผิดปกติโดยไม่เปิดเผยข้อมูลอ่อนไหวของนักกีฬาเกินความจำเป็น</p></div></section>
    <section style={{ margin: '-18px auto 0', maxWidth: 1080, padding: '0 16px', position: 'relative' }}>
      {!schemaReady && <section style={{ alignItems: 'flex-start', background: '#fff8e7', border: '1px solid #f0d699', borderRadius: 12, color: '#6e4a00', display: 'flex', gap: 11, marginBottom: 15, padding: 14 }}><AlertTriangle size={20} style={{ flex: '0 0 auto', marginTop: 1 }} /><div><b style={{ display: 'block', fontSize: 13 }}>Trust Foundation ยังไม่เปิดใช้</b><span style={{ display: 'block', fontSize: 12, lineHeight: 1.5, marginTop: 3 }}>หน้านี้พร้อมแล้ว แต่ต้อง apply <code>sql/31-data-trust-foundation-v1.sql</code> และทดสอบ RLS ก่อนจึงจะอ่านคิวจริงได้</span></div></section>}
      <div style={{ display: 'grid', gap: 11, gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))' }}><Metric value={count(provenance)} label="Provenance records" note="ข้อมูลที่มีแหล่งอ้างอิง" tone="navy" /><Metric value={count(evidence)} label="Evidence รอตรวจ" note="หลักฐานยังไม่ผ่าน review" tone={count(evidence) ? 'amber' : 'green'} /><Metric value={count(disputes)} label="Disputes เปิดอยู่" note="คัดค้านข้อมูล/ผลแข่งขัน" tone={count(disputes) ? 'red' : 'green'} /><Metric value={count(anomalies)} label="Anomaly flags" note="สัญญาณข้อมูลผิดปกติ" tone={count(anomalies) ? 'red' : 'green'} /></div>
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(0,1.12fr) minmax(280px,.88fr)', marginTop: 17 }}>
        <section style={{ background: '#fff', border: '1px solid #e1e6ec', borderRadius: 15, padding: 17 }}><p style={{ color: '#cc0001', font: '800 10px var(--font-oswald)', letterSpacing: 1.2, margin: 0 }}>REVIEW QUEUE</p><h2 style={{ color: '#172033', fontSize: 21, margin: '3px 0 14px' }}>ตัดสินใจจากหลักฐาน ไม่ใช่ความรู้สึก</h2><div style={{ display: 'grid', gap: 8 }}><WorkItem icon={<FileCheck2 size={19} />} title="ตรวจหลักฐาน" body="ยืนยันแหล่งที่มาและระดับการตรวจสอบก่อนยกระดับข้อมูล" href="/admin/trust" state={schemaReady ? `${count(evidence)} รอตรวจ` : 'รอ SQL31'} /><WorkItem icon={<Scale size={19} />} title="ข้อโต้แย้งข้อมูล" body="เปิด case, เก็บเหตุผล, และบันทึกผลการพิจารณาที่ตรวจย้อนหลังได้" href="/admin/trust" state={schemaReady ? `${count(disputes)} เปิดอยู่` : 'รอ SQL31'} /><WorkItem icon={<ShieldAlert size={19} />} title="สัญญาณผิดปกติ" body="ตรวจผลซ้ำ, คะแนนกระโดด, หรือ pattern การบันทึกที่เสี่ยง" href="/admin/trust" state={schemaReady ? `${count(anomalies)} flags` : 'รอ SQL31'} /></div></section>
        <aside style={{ display: 'grid', gap: 12, height: 'fit-content' }}><section style={{ background: '#111b2a', borderRadius: 15, color: 'white', padding: 17 }}><p style={{ color: '#f5c518', font: '800 10px var(--font-oswald)', letterSpacing: 1.2, margin: 0 }}>RANK EXPLAINABILITY</p><b style={{ display: 'block', fontSize: 18, marginTop: 5 }}>คำตอบของคำถาม “ทำไมคนนี้ Rank นี้?”</b><p style={{ color: 'rgba(255,255,255,.66)', fontSize: 12, lineHeight: 1.55, margin: '9px 0 13px' }}>Rank explanation {schemaReady ? `${count(explanations)} รายการ` : 'จะเริ่มเก็บหลัง SQL31'} ต้องชี้กลับถึง rating event และระดับการยืนยันได้</p><Link href="/ranking" style={{ color: '#f5c518', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}><Eye size={14} style={{ marginRight: 5, verticalAlign: -2 }} /> ดู Ranking ปัจจุบัน</Link></section><section style={{ background: '#fff', border: '1px solid #e1e6ec', borderRadius: 15, padding: 17 }}><p style={{ color: '#cc0001', font: '800 10px var(--font-oswald)', letterSpacing: 1.2, margin: 0 }}>GUARDRAIL</p><b style={{ color: '#172033', display: 'block', fontSize: 15, marginTop: 5 }}><BadgeCheck size={16} color="#15803d" style={{ marginRight: 6, verticalAlign: -3 }} />แก้ข้อมูลด้วย event ใหม่</b><p style={{ color: '#697689', fontSize: 11, lineHeight: 1.55, margin: '7px 0 0' }}>Verification history เป็น append-only: การแก้ไขต้องทิ้งเหตุผลและหลักฐาน ไม่เขียนทับประวัติเดิม</p></section></aside>
      </div>
    </section>
  </main>
}
