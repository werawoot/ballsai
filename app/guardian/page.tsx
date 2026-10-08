import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import { createServerClient } from '@supabase/ssr'
import GuardianLinksClient, { type GuardianLink } from './GuardianLinksClient'
import PageHeader from '@/components/PageHeader'

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
  const t = await getTranslations('header')
  const tp = await getTranslations('guardianPage')

  const [{ data: profile }, { data: guardianRows }, { data: incomingRows }] = await Promise.all([
    supabase.from('profiles').select('onboarding_persona').eq('id', user.id).maybeSingle(),
    supabase.from('guardian_links').select('id, status, requested_at, athlete_profiles!guardian_links_athlete_id_fkey(display_name, is_public, athlete_progress(xp_total, current_level), athlete_badges(badge_key))').eq('guardian_id', user.id).order('requested_at', { ascending: false }),
    supabase.from('guardian_links').select('id, status, requested_at').eq('athlete_id', user.id).eq('status', 'pending').order('requested_at', { ascending: false }),
  ])
  const isGuardian = (profile as Profile | null)?.onboarding_persona === 'guardian'
  const links = ((guardianRows ?? []) as unknown as LinkRow[]).map(mapLink)
  const incoming = ((incomingRows ?? []) as unknown as LinkRow[]).map(mapLink)

  return <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5', paddingBottom: 48 }}>
    <PageHeader back={{ href: '/profile', label: t('back.profile') }} />
    <section style={{ background: '#101827', color: 'white', padding: '30px 18px 34px' }}><div style={{ maxWidth: 720, margin: '0 auto' }}><h1 style={{ fontSize: 'clamp(28px,7vw,40px)', lineHeight: 1.2, margin: '0 0 9px', fontWeight: 800 }}>{tp('title')}</h1><p style={{ maxWidth: 480, color: 'rgba(255,255,255,.7)', fontSize: 15, lineHeight: 1.55, margin: 0 }}>{tp('sub')}</p></div></section>
    <section style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px' }}>
      {!isGuardian && incoming.length === 0 && <div style={{ background: '#fff8e6', border: '1px solid #f4d98b', borderRadius: 12, padding: 14, color: '#624a00', fontSize: 13, lineHeight: 1.55, marginBottom: 16 }}>หน้านี้สำหรับผู้ปกครอง หรือสำหรับนักกีฬาที่มีคำขอเชื่อมบัญชีรออยู่ หากเลือกบทบาทไม่ตรง ให้เริ่ม onboarding ใหม่ด้วยบัญชีผู้ปกครอง</div>}
      <GuardianLinksClient isGuardian={isGuardian} links={links} incoming={incoming} />
    </section>
  </main>
}
