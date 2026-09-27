import { ClipboardPenLine } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import MatchPlanClient, { type MatchPlanTeam } from './MatchPlanClient'
import PageHeader from '@/components/PageHeader'

export default async function MatchPlanPage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/match-plan')

  const [{ data: profile }, { data: teams }] = await Promise.all([
    supabase.from('profiles').select('role, onboarding_persona').eq('id', user.id).single(),
    supabase.from('teams').select('id, name, status, tournament_id, tournaments(name, start_date)').order('created_at', { ascending: false }),
  ])

  const canCoach = profile?.role === 'organizer' || profile?.role === 'admin' || profile?.onboarding_persona === 'coach_organizer'
  if (!canCoach) redirect('/')

  return (
    <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 56 }}>
      <PageHeader back={{ href: '/dashboard', label: 'Dashboard' }} />

      <section style={{ background: 'linear-gradient(118deg,#101827 0%,#203047 60%,#8d1014 140%)', color: 'white', padding: '34px 18px 41px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: .15, backgroundImage: 'repeating-linear-gradient(135deg, transparent 0 20px, white 20px 21px)' }} />
        <div style={{ maxWidth: 850, margin: '0 auto', position: 'relative' }}>
          <p style={{ color: '#f5c518', margin: 0, font: '800 11px var(--font-oswald)', letterSpacing: 1.4 }}>COACH DESK · PRE-MATCH</p>
          <h1 style={{ margin: '9px 0 6px', font: '800 clamp(38px,8vw,68px)/.88 var(--font-oswald)', letterSpacing: -.5 }}>MATCH<br /><span style={{ color: '#f5c518' }}>PLAN.</span></h1>
          <p style={{ margin: 0, maxWidth: 510, color: 'rgba(255,255,255,.75)', fontSize: 13, lineHeight: 1.55 }}>วางตัวจริง สำรอง ตำแหน่ง และข้อความก่อนแข่ง — แผนนี้ไม่ใช่ผลการแข่งขัน และไม่เปลี่ยน Rating, XP หรือ Badge</p>
        </div>
      </section>

      <section style={{ maxWidth: 850, margin: '0 auto', padding: '22px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#394150', marginBottom: 14, fontSize: 12, fontWeight: 700 }}><ClipboardPenLine size={16} color="#CC0001" /> เลือกได้เฉพาะสมาชิกที่ตอบรับคำเชิญเข้าทีมแล้ว</div>
        <MatchPlanClient teams={(teams ?? []) as MatchPlanTeam[]} />
      </section>
    </main>
  )
}
