import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PlayerCardBuilder from './PlayerCardBuilder'
import BrandMark from '@/components/BrandMark'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import { signAvatarUrls } from '@/lib/athlete-avatar'
import { cardProvenance, playerCardStats, type CardSeason } from '@/lib/player-card'
import './card.css'

type Profile = { full_name?: string | null; province?: string | null; team?: string | null; position?: string | null }
type AthleteProfile = { display_name?: string | null; position?: string | null; province?: string | null; current_team?: string | null; profile_image_url?: string | null; verification_level?: string | null; is_public?: boolean }
type PlayerRank = { id: string; player_name: string; position: string | null; ovr: number | null; pac: number | null; sho: number | null; pas: number | null; dri: number | null; def: number | null }
type Rating = { power_rating: number | null; matches_played: number | null; goals: number | null; assists: number | null; mvps: number | null }

export default async function PlayerCardPage() {
  const t = await getTranslations('card')
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/card')

  // One season at a time (lib/season.ts): the rank row and the verified results behind it.
  const [{ data: profile }, { data: athlete }, { data: rank }, { data: rating }] = await Promise.all([
    supabase.from('profiles').select('full_name, province, team, position').eq('id', user.id).maybeSingle(),
    supabase.from('athlete_profiles').select('display_name, position, province, current_team, profile_image_url, verification_level, is_public').eq('user_id', user.id).maybeSingle(),
    supabase.from('player_ranks').select('id, player_name, position, ovr, pac, sho, pas, dri, def').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle(),
    supabase.from('player_ratings').select('power_rating, matches_played, goals, assists, mvps').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle(),
  ])

  const p = (profile ?? {}) as Profile
  const athleteProfile = (athlete ?? {}) as AthleteProfile
  const playerRank = rank as PlayerRank | null
  const ratingRow = rating as Rating | null
  const name = playerRank?.player_name || athleteProfile.display_name || p.full_name || ''
  const season: CardSeason | null = playerRank && ratingRow ? {
    matches: ratingRow.matches_played ?? 0,
    goals: ratingRow.goals ?? 0,
    assists: ratingRow.assists ?? 0,
    mvps: ratingRow.mvps ?? 0,
    power: typeof ratingRow.power_rating === 'number' ? Math.round(ratingRow.power_rating) : null,
  } : null
  // The photo is a private object (T51); the owner may always sign their own.
  const storedImage = athleteProfile.profile_image_url || null
  const imageUrl = storedImage ? (await signAvatarUrls(supabase, [storedImage])).get(storedImage) ?? null : null

  return (
    <main className="card-page">
      <header className="card-page-header">
        <Link href="/" className="card-page-logo"><BrandMark size={22} />BallDoenSai.com</Link>
        <div><Link href="/career" className="card-page-profile-link">Athlete Passport</Link><Link href="/profile/edit" className="card-page-profile-link">{t('editProfile')}</Link></div>
      </header>
      <PlayerCardBuilder
        userId={user.id}
        publicProfilePath={athleteProfile.is_public ? `/players/${playerRank?.id || user.id}` : null}
        seasonLabel={ACTIVE_SEASON}
        player={{
          name,
          position: playerRank?.position || athleteProfile.position || p.position || 'MF',
          team: athleteProfile.current_team || p.team || '',
          province: athleteProfile.province || p.province || '',
          imageUrl,
          imagePath: storedImage,
          hasProfile: Boolean(athlete),
          isVerified: athleteProfile.verification_level === 'performance_verified' || athleteProfile.verification_level === 'coach_verified',
          isRanked: Boolean(playerRank),
          // A starter card (no rank row) shows no numbers: never a default as performance.
          stats: playerCardStats(playerRank),
          provenance: cardProvenance({ matches: season?.matches ?? null, verificationLevel: athleteProfile.verification_level ?? null }),
          season,
        }}
      />
    </main>
  )
}
