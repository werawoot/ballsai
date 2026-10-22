import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { getLocale, getTranslations } from 'next-intl/server'
import Link from 'next/link'
import { CheckCircle2, MapPin, Shield, Star, User, Users, Zap } from 'lucide-react'
import AthleteFilters from './AthleteFilters'
import DiscoverTabs from '@/components/DiscoverTabs'
import { samplePlayerRanks, showDemoData } from '@/lib/sample-data'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import PageHeader from '@/components/PageHeader'
import Pagination from '@/components/Pagination'
import { parsePage } from '@/lib/pagination'
import { fetchPublicAthletesPage, type PublicAthlete as AthleteProfile, type PublicAthleteRank as PlayerRank } from '@/lib/public-athletes'
import { PROVINCE_NAMES_EN, provinceName } from '@/lib/thai-provinces'
import type { Locale } from '@/i18n/config'
import { withAvatarUrls } from '@/lib/athlete-avatar'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import './athletes.css'
// /athletes on the light glass design (ADR-014), like /ranking: a stadium head with the
// discover switch and the title, the filters, then frosted athlete cards over the blurred
// grass. Each card states where its number comes from: Power only from a rank row, else
// "no Power yet" (AGENTS.md rule 8).
type DirectoryAthlete = AthleteProfile & { sampleRank?: (typeof samplePlayerRanks)[number] }

function matchesAge(age: number | null, group: string) {
  if (!group) return true
  if (age === null) return false
  if (group === 'u12') return age < 12
  if (group === 'u15') return age < 15
  if (group === 'u18') return age < 18
  if (group === 'adult') return age >= 20
  return true
}

function PositionMark({ position }: { position: string }) {
  if (position === 'GK' || position === 'DF') return <Shield size={25} />
  if (position === 'MF') return <Zap size={25} />
  return <Star size={25} />
}

export default async function AthletesPage(
  props: { searchParams: Promise<{ search?: string; province?: string; position?: string; age?: string; page?: string }> }
) {
  const searchParams = await props.searchParams
  const [t, locale] = await Promise.all([getTranslations('athletesPage'), getLocale() as Promise<Locale>])
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: cookiesToSet => cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })

  const search = searchParams.search?.trim() || ''
  const province = searchParams.province || ''
  const position = searchParams.position || ''
  const ageGroup = searchParams.age || ''
  const page = parsePage(searchParams.page)
  // Every filter, the age group included, runs in the database before it pages, so each
  // page is full and every matching athlete is on exactly one of them.
  const { athletes: storedProfiles, ranks: rankRows, hasNext } = await fetchPublicAthletesPage(supabase, {
    page, sport: ACTIVE_SPORT, season: ACTIVE_SEASON, search, province, position, ageGroup,
  }).catch(error => {
    console.error(JSON.stringify({ level: 'error', event: 'public_athletes_fetch_failed', message: error?.message ?? String(error) }))
    return { athletes: [] as AthleteProfile[], ranks: [] as PlayerRank[], hasNext: false }
  })
  // Photos are private objects (T51); one signed URL request covers the whole page.
  const realProfiles = await withAvatarUrls(supabase, storedProfiles)
  const rankByAthlete = new Map(rankRows.map(rank => [rank.player_id, rank]))

  const profiles: DirectoryAthlete[] = realProfiles.length > 0 ? realProfiles : showDemoData ? samplePlayerRanks.map(player => ({
    user_id: player.id,
    display_name: player.player_name,
    age: null,
    position: player.position,
    province: player.province,
    current_team: player.team,
    profile_image_url: null,
    verification_level: 'self' as const,
    sampleRank: player,
  })) : []
  // Real rows are already filtered by age in the database; this only narrows demo data.
  const visibleProfiles = realProfiles.length > 0 ? profiles : profiles.filter(profile => matchesAge(profile.age ?? null, ageGroup))
  // All 77 provinces, not only those on this page: a province whose athletes sit on a
  // later page must still be selectable.
  const provinces = Object.keys(PROVINCE_NAMES_EN).sort((a, b) => a.localeCompare(b, 'th'))

  return (
    <main className="bds-page at gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.athletes) as React.CSSProperties}>
      <PageHeader eyebrow={t('eyebrow')} />

      <section className="at-stadium">
        <div className="at-stadium-inner">
          <DiscoverTabs current="/athletes" />
          <p className="at-eyebrow">{t('heroEyebrow')}</p>
          <h1 className="at-title">{t('title')}</h1>
          <p className="at-intro">{t('intro')}</p>
        </div>
      </section>

      <AthleteFilters provinces={provinces} currentSearch={search} currentProvince={province} currentPosition={position} currentAge={ageGroup} />

      <section className="at-wrap">
        <div className="at-head"><h2>{t('found')}</h2><span>{t('count', { count: visibleProfiles.length })}</span></div>
        {visibleProfiles.length === 0 ? <div className="at-empty gl-card"><User size={34} strokeWidth={1.4} aria-hidden="true" /><p>{t('empty')}</p></div> : <div className="at-grid">
          {visibleProfiles.map(profile => {
            const sampleRank = profile.sampleRank
            const rank = rankByAthlete.get(profile.user_id) || sampleRank
            const routeId = rank?.id || profile.user_id
            const athleteAge = profile.age ?? null
            const verified = profile.verification_level !== 'self'
            return <Link className="at-card gl-card" key={profile.user_id} href={`/players/${routeId}`}>
              <div className="at-photo" style={profile.profile_image_url ? { backgroundImage: `url(${profile.profile_image_url})` } : undefined}>
                {!profile.profile_image_url && <PositionMark position={profile.position || ''} />}
                <span className="at-pos">{profile.position || '—'}</span>
                {verified && <span className="at-verified" title={t('verified')}><CheckCircle2 size={15} aria-label={t('verified')} /></span>}
              </div>
              <div className="at-body">
                <b className="at-name">{profile.display_name}</b>
                <span className="at-line"><Users size={12} aria-hidden="true" /><span>{profile.current_team || t('noTeam')}</span></span>
                <span className="at-line"><MapPin size={12} aria-hidden="true" /><span>{profile.province ? provinceName(profile.province, locale) : t('noProvince')}{athleteAge !== null && ` · ${t('age', { age: athleteAge })}`}</span></span>
                <span className="at-power"><small>{t('power')}</small><b className={rank ? '' : 'is-none'}>{rank ? rank.pts.toLocaleString() : t('noPower')}</b></span>
              </div>
            </Link>
          })}
        </div>}
        <Pagination basePath="/athletes" page={page} hasNext={hasNext} params={{ search, province, position, age: ageGroup }} />
      </section>

    </main>
  )
}
