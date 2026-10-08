import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import EditTournamentForm from './EditTournamentForm'
import PageHeader from '@/components/PageHeader'
import { getTranslations } from 'next-intl/server'

type TournamentRecord = {
  id: string
  name: string
  description: string | null
  location: string
  start_date: string
  end_date: string | null
  fee: number
  promptpay: string | null
  max_teams: number | null
  status: string
  organizer_id: string
}

export default async function EditTournamentPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params
  const tl = await getTranslations('labels')
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
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'organizer' && profile?.role !== 'admin') redirect('/')

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('*')
    .eq('id', params.id)
    .single()

  const typedTournament = (tournament ?? null) as TournamentRecord | null
  if (!typedTournament) redirect('/dashboard')

  if (profile?.role !== 'admin' && typedTournament.organizer_id !== user.id) {
    redirect('/dashboard')
  }

  return (
    <main style={{ background: '#f8f8f8', minHeight: '100vh', overflowX: 'hidden', paddingBottom: 40 }}>
      <PageHeader back={{ href: '/dashboard', label: tl('dashboardLabels.back') }} />

      <div style={{ background: '#CC0001', padding: '20px 16px 36px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'repeating-linear-gradient(-45deg,transparent,transparent 20px,rgba(255,255,255,0.03) 20px,rgba(255,255,255,0.03) 21px)' }} />
        <div style={{ position: 'relative' }}>
          <h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(28px,8vw,48px)', fontWeight: 700, color: 'white', lineHeight: 0.9, textTransform: 'uppercase' }}>
            แก้ไข<br />
            <span style={{ WebkitTextStroke: '2px rgba(255,255,255,0.4)', color: 'transparent' }}>รายการแข่ง</span>
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 10 }}>{typedTournament.name}</p>
        </div>
      </div>

      <svg viewBox="0 0 375 28" preserveAspectRatio="none" style={{ display: 'block', width: '100%', height: 28, marginTop: -1 }}>
        <path d="M0,0 C100,28 275,0 375,20 L375,0 Z" fill="#CC0001" />
      </svg>

      <EditTournamentForm tournament={typedTournament} />
    </main>
  )
}
