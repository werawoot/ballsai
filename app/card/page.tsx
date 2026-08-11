import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Trophy } from 'lucide-react'
import PlayerCardBuilder from './PlayerCardBuilder'

type Profile = { full_name?: string | null; province?: string | null; team?: string | null; position?: string | null }
type AthleteProfile = { display_name?: string | null; position?: string | null; province?: string | null; current_team?: string | null; profile_image_url?: string | null; verification_level?: string | null }
type PlayerRank = { player_name: string; position: string; ovr: number; pac: number; sho: number; pas: number; dri: number; def: number }

export default async function PlayerCardPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/card')

  const [{ data: profile }, { data: athlete }, { data: rank }] = await Promise.all([
    supabase.from('profiles').select('full_name, province, team, position').eq('id', user.id).maybeSingle(),
    supabase.from('athlete_profiles').select('display_name, position, province, current_team, profile_image_url, verification_level').eq('user_id', user.id).maybeSingle(),
    supabase.from('player_ranks').select('player_name, position, ovr, pac, sho, pas, dri, def').eq('player_id', user.id).eq('sport', 'football').maybeSingle(),
  ])

  const p = (profile ?? {}) as Profile
  const athleteProfile = (athlete ?? {}) as AthleteProfile
  const playerRank = rank as PlayerRank | null
  const name = playerRank?.player_name || athleteProfile.display_name || p.full_name || 'YOUR NAME'

  return (
    <main className="card-page">
      <header className="card-page-header">
        <Link href="/" className="card-page-logo"><Trophy size={18} /> BallDoenSai.com</Link>
        <div style={{ display: 'flex', gap: 8 }}><Link href="/career" className="card-page-profile-link">Athlete Passport</Link><Link href="/profile" className="card-page-profile-link">แก้ไขโปรไฟล์</Link></div>
      </header>
      <PlayerCardBuilder
        player={{
          name,
          position: playerRank?.position || athleteProfile.position || p.position || 'MF',
          team: athleteProfile.current_team || p.team || 'BALLDOENSAI ACADEMY',
          province: athleteProfile.province || p.province || 'THAILAND',
          imageUrl: athleteProfile.profile_image_url || null,
          isVerified: athleteProfile.verification_level === 'performance_verified' || athleteProfile.verification_level === 'coach_verified',
          isRanked: Boolean(playerRank),
          stats: playerRank ? { ovr: playerRank.ovr, pac: playerRank.pac, sho: playerRank.sho, pas: playerRank.pas, dri: playerRank.dri, def: playerRank.def } : { ovr: 65, pac: 66, sho: 62, pas: 64, dri: 65, def: 55 },
        }}
      />
    </main>
  )
}
