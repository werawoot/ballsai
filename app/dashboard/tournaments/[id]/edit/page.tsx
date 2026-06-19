import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trophy } from 'lucide-react'
import EditTournamentForm from './EditTournamentForm'

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

export default async function EditTournamentPage({ params }: { params: { id: string } }) {
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
      <header style={{ position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 16px', height: 54, background: '#CC0001', boxShadow: '0 2px 12px rgba(204,0,1,0.3)' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-oswald)', fontSize: 24, fontWeight: 800, letterSpacing: 2, color: 'white', display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
          <Trophy size={22} strokeWidth={2.5} /> BALLSAI
        </Link>
        <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
          <ArrowLeft size={16} /> กลับ
        </Link>
      </header>

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
