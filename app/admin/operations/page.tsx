import Link from 'next/link'
import { UserMinus, Activity, ArrowLeft, CheckCircle2, CircleAlert, Database, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export const dynamic = 'force-dynamic'

type Status = 'ready' | 'attention'

function StatusCard({
  icon,
  title,
  detail,
  status,
}: {
  icon: React.ReactNode
  title: string
  detail: string
  status: Status
}) {
  const ready = status === 'ready'

  return (
    <article style={{ background: 'white', border: `1px solid ${ready ? '#bfe8ce' : '#f4d08a'}`, borderRadius: 16, padding: 18, boxShadow: '0 4px 18px rgba(17,24,39,.05)' }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 10, justifyContent: 'space-between' }}>
        <div style={{ alignItems: 'center', display: 'flex', gap: 10 }}>
          <span style={{ alignItems: 'center', background: ready ? '#e9f8ee' : '#fff7e6', borderRadius: 10, color: ready ? '#168448' : '#ad6800', display: 'inline-flex', height: 36, justifyContent: 'center', width: 36 }}>{icon}</span>
          <h2 style={{ color: '#111827', fontFamily: 'var(--font-oswald)', fontSize: 18, letterSpacing: .4, margin: 0 }}>{title}</h2>
        </div>
        {ready ? <CheckCircle2 aria-label="พร้อม" color="#168448" size={21} /> : <CircleAlert aria-label="ต้องตั้งค่า" color="#ad6800" size={21} />}
      </div>
      <p style={{ color: '#596275', fontSize: 14, lineHeight: 1.55, margin: '14px 0 0' }}>{detail}</p>
    </article>
  )
}

export default async function OperationsPage() {
  const supabase = await createServerSupabaseClient()
  const [tournaments, ratings, profiles, slipBucket, deletionRequests] = await Promise.all([
    supabase.from('tournaments').select('id', { count: 'exact', head: true }),
    supabase.from('player_ratings').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.storage.getBucket('slips'),
    // Removing the auth account needs the service role key, which this app does not hold,
    // so the last step of a PDPA deletion is a human one. This is its queue.
    supabase
      .from('account_deletion_requests')
      .select('id, email, requested_at')
      .is('completed_at', null)
      .order('requested_at', { ascending: true })
      .limit(25),
  ])

  const openDeletions = (deletionRequests.data ?? []) as Array<{ id: number; email: string | null; requested_at: string }>

  const databaseReady = !tournaments.error && !ratings.error && !profiles.error
  const slipsPrivate = !slipBucket.error && slipBucket.data?.public === false
  const emailReady = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL)
  const distributedRateLimitReady = Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  const demoDisabled = process.env.NEXT_PUBLIC_SHOW_DEMO_DATA !== 'true'

  return (
    <main style={{ background: '#f6f7f9', minHeight: '100vh', paddingBottom: 56 }}>
      <header style={{ alignItems: 'center', background: '#111827', color: 'white', display: 'flex', justifyContent: 'space-between', padding: '16px clamp(18px,5vw,72px)' }}>
        <Link href="/admin" style={{ alignItems: 'center', color: 'white', display: 'inline-flex', fontSize: 14, fontWeight: 700, gap: 8, textDecoration: 'none' }}><ArrowLeft size={18} /> Admin panel</Link>
        <span style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, letterSpacing: 1.3 }}>OPERATIONS</span>
      </header>

      <section style={{ margin: '0 auto', maxWidth: 920, padding: 'clamp(28px,6vw,70px) 20px' }}>
        <p style={{ color: '#d71920', fontFamily: 'var(--font-oswald)', fontSize: 13, fontWeight: 700, letterSpacing: 1.5, margin: 0 }}>BALLDOENSAI.COM · PRODUCTION READINESS</p>
        <h1 style={{ color: '#111827', fontFamily: 'var(--font-sarabun)', fontSize: 'clamp(32px,6vw,56px)', letterSpacing: '-.05em', lineHeight: .98, margin: '10px 0 14px' }}>สถานะระบบ<br /><span style={{ color: '#d71920' }}>ก่อนเปิดใช้งานจริง</span></h1>
        <p style={{ color: '#596275', lineHeight: 1.65, margin: 0, maxWidth: 620 }}>หน้านี้แสดงเฉพาะสถานะการเชื่อมต่อและการตั้งค่าที่สำคัญ โดยไม่เปิดเผยรหัสหรือข้อมูลลับ</p>

        <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fit, minmax(245px, 1fr))', marginTop: 30 }}>
          <StatusCard icon={<Database size={19} />} title="Supabase database" status={databaseReady ? 'ready' : 'attention'} detail={databaseReady ? `พร้อมใช้งาน · ${tournaments.count ?? 0} รายการแข่ง · ${ratings.count ?? 0} rating records · ${profiles.count ?? 0} accounts` : 'ตรวจสอบการเชื่อมต่อ Supabase หรือ RLS ของตารางหลัก'} />
          <StatusCard icon={<LockKeyhole size={19} />} title="Payment slips" status={slipsPrivate ? 'ready' : 'attention'} detail={slipsPrivate ? 'Bucket slips เป็น private และเปิดผ่าน signed URL เท่านั้น' : 'ยังไม่พบ bucket slips แบบ private — ตรวจสอบ Storage และ migration'} />
          <StatusCard icon={<Mail size={19} />} title="Transactional email" status={emailReady ? 'ready' : 'attention'} detail={emailReady ? 'พร้อมส่งอีเมลสถานะทีมจากโดเมนที่กำหนด' : 'ต้องตั้ง RESEND_FROM_EMAIL หลังยืนยันโดเมนใน Resend'} />
          <StatusCard icon={<ShieldCheck size={19} />} title="Rate limiting" status={distributedRateLimitReady ? 'ready' : 'attention'} detail={distributedRateLimitReady ? 'ใช้ Upstash Redis ร่วมกันทุก instance' : 'กำลังใช้ fallback ใน memory; ต้องเชื่อม Upstash ก่อน deploy แบบหลาย instance'} />
          <StatusCard icon={<Activity size={19} />} title="Closed beta data mode" status={demoDisabled ? 'ready' : 'attention'} detail={demoDisabled ? 'Demo fallback ถูกปิด ระบบจะแสดงข้อมูลจาก Supabase จริงเท่านั้น' : 'ต้องตั้ง NEXT_PUBLIC_SHOW_DEMO_DATA=false ก่อนเชิญผู้จัดจริง'} />
        </div>

        <div style={{ background: 'white', border: `1.5px solid ${openDeletions.length > 0 ? '#f4d98b' : '#e5e7eb'}`, borderRadius: 16, marginTop: 24, padding: 20 }}>
          <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 10 }}>
            <UserMinus color={openDeletions.length > 0 ? '#854d0e' : '#596275'} size={20} />
            <strong style={{ color: '#111827', fontFamily: 'var(--font-oswald)', fontSize: 16, letterSpacing: .3 }}>
              คำขอลบบัญชีที่ยังไม่ปิด ({openDeletions.length})
            </strong>
          </div>
          {deletionRequests.error ? (
            <p style={{ color: '#854d0e', fontSize: 13, lineHeight: 1.7, margin: 0 }}>
              ยังอ่านคิวคำขอไม่ได้ — apply <code>sql/data-deletion-v1.sql</code> ก่อน
            </p>
          ) : openDeletions.length === 0 ? (
            <p style={{ color: '#596275', fontSize: 13, margin: 0 }}>ไม่มีคำขอค้าง</p>
          ) : (
            <>
              <ul style={{ color: '#374151', fontSize: 13, lineHeight: 1.9, margin: '0 0 10px', paddingLeft: 20 }}>
                {openDeletions.map(request => (
                  <li key={request.id}>{request.email ?? 'ไม่ทราบอีเมล'} · ขอเมื่อ {new Date(request.requested_at).toLocaleDateString('th-TH')}</li>
                ))}
              </ul>
              <p style={{ color: '#596275', fontSize: 12, lineHeight: 1.7, margin: 0 }}>
                ข้อมูลนักกีฬาถูกลบและชื่อในตาราง ranking ถูกตัดออกแล้ว เหลือขั้นตอนลบบัญชีใน Supabase → Authentication → Users แล้วบันทึก <code>completed_at</code> ในตาราง <code>account_deletion_requests</code>
              </p>
            </>
          )}
        </div>

        <div style={{ alignItems: 'center', background: '#111827', borderRadius: 16, color: 'white', display: 'flex', gap: 14, marginTop: 24, padding: 20 }}>
          <Activity color="#f4b942" size={30} />
          <div><strong style={{ display: 'block', fontSize: 16 }}>คำแนะนำลำดับถัดไป</strong><span style={{ color: 'rgba(255,255,255,.7)', fontSize: 14 }}>ตั้งค่า Resend sender และ Upstash Redis แล้วกลับมาตรวจหน้านี้อีกครั้งก่อน deploy</span></div>
        </div>
      </section>
    </main>
  )
}
