import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Trophy } from 'lucide-react'
import { createServerClient } from '@supabase/ssr'
import GuardianLinksClient, { type GuardianLink } from './GuardianLinksClient'

type Profile = { onboarding_persona: string | null }
type LinkRow = {
  id: string
  status: GuardianLink['status']
  requested_at: string
  athlete_profiles: {
    display_name: string
    is_public: boolean
    athlete_progress: { xp_total: number; current_level: number }[] | null
    athlete_badges: { badge_key: string }[] | null
  } | null
}

function mapLink(row: LinkRow): GuardianLink {
  const athlete = row.athlete_profiles
  return {
    id: row.id,
    status: row.status,
    requested_at: row.requested_at,
    athlete: athlete ? {
      display_name: athlete.display_name || 'นักกีฬา BallDoenSai',
      is_public: athlete.is_public,
      progress: athlete.athlete_progress?.[0] ?? null,
      badge_count: athlete.athlete_badges?.length ?? 0,
    } : null,
  }
}

export default async function GuardianPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: values => values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/guardian')

  const [{ data: profile }, { data: guardianRows }, { data: incomingRows }] = await Promise.all([
    supabase.from('profiles').select('onboarding_persona').eq('id', user.id).maybeSingle(),
    supabase.from('guardian_links').select('id, status, requested_at, athlete_profiles!guardian_links_athlete_id_fkey(display_name, is_public, athlete_progress(xp_total, current_level), athlete_badges(badge_key))').eq('guardian_id', user.id).order('requested_at', { ascending: false }),
    supabase.from('guardian_links').select('id, status, requested_at').eq('athlete_id', user.id).eq('status', 'pending').order('requested_at', { ascending: false }),
  ])
  const isGuardian = (profile as Profile | null)?.onboarding_persona === 'guardian'
  const links = ((guardianRows ?? []) as unknown as LinkRow[]).map(mapLink)
  const incoming = ((incomingRows ?? []) as unknown as LinkRow[]).map(mapLink)

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 48 }}>
    <header className="bds-header" style={{ height: 54, padding: '0 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#CC0001', color: 'white' }}><Link href="/" style={{ color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-oswald)', fontSize: 23, fontWeight: 800 }}><Trophy size={21} /> BallDoenSai.com</Link><Link href="/profile" style={{ color: 'white', fontSize: 12, fontWeight: 800, textDecoration: 'none' }}>โปรไฟล์</Link></header>
    <section style={{ background: '#101827', color: 'white', padding: '30px 18px 34px' }}><div style={{ maxWidth: 720, margin: '0 auto' }}><p style={{ color: '#f5c518', fontSize: 10, fontWeight: 800, letterSpacing: 1.5, margin: 0 }}>FAMILY SUPPORT</p><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(32px,8vw,48px)', lineHeight: .95, margin: '9px 0' }}>ผู้ปกครอง<br /><span style={{ color: '#f5c518' }}>ดูแลเส้นทาง</span></h1><p style={{ maxWidth: 480, color: 'rgba(255,255,255,.7)', fontSize: 13, lineHeight: 1.55, margin: 0 }}>เชื่อมบัญชีด้วยความยินยอมของผู้ปกครองและการตอบรับของนักกีฬา เพื่อดูความก้าวหน้าอย่างปลอดภัย</p></div></section>
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      {!isGuardian && incoming.length === 0 && <div style={{ background: '#fff8e6', border: '1px solid #f4d98b', borderRadius: 12, padding: 14, color: '#624a00', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>หน้านี้สำหรับผู้ปกครอง หรือสำหรับนักกีฬาที่มีคำขอเชื่อมบัญชีรออยู่ หากเลือกบทบาทไม่ตรง ให้เริ่ม onboarding ใหม่ด้วยบัญชีผู้ปกครอง</div>}
      <GuardianLinksClient isGuardian={isGuardian} links={links} incoming={incoming} />
    </section>
  </main>
}
