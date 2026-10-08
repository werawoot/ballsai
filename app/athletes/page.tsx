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
    <main className="bds-page" style={{ minHeight: '100vh', background: '#f7f7f5' }}>
      <PageHeader eyebrow={t('eyebrow')} />

      <section className="bds-hero" style={{ background: '#111', color: 'white', padding: '25px 16px 22px' }}>
        <div style={{ maxWidth: 920, margin: '0 auto' }}><span style={{ fontSize: 10, fontWeight: 800, color: '#ff7373' }}>{t('heroEyebrow')}</span><h1 style={{ fontFamily: 'var(--font-oswald)', fontSize: 'clamp(30px,8vw,48px)', lineHeight: 1, marginTop: 5 }}>{t('title')}</h1><p style={{ fontSize: 12, color: '#aaa', marginTop: 8 }}>{t('intro')}</p></div>
      </section>

      <DiscoverTabs current="/athletes" />

      <AthleteFilters provinces={provinces} currentSearch={search} currentProvince={province} currentPosition={position} currentAge={ageGroup} />

      <section className="bds-content" style={{ maxWidth: 920, margin: '0 auto', padding: '18px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}><h2 className="bds-section-title" style={{ fontFamily: 'var(--font-oswald)', fontSize: 17 }}>{t('found')}</h2><span style={{ fontSize: 11, color: '#888' }}>{t('count', { count: visibleProfiles.length })}</span></div>
        {visibleProfiles.length === 0 ? <div style={{ padding: '50px 20px', textAlign: 'center', borderTop: '1px solid #ddd', color: '#888' }}><User size={34} strokeWidth={1.3} /><p style={{ marginTop: 10, fontSize: 13 }}>{t('empty')}</p></div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 10 }}>
          {visibleProfiles.map(profile => {
            const sampleRank = profile.sampleRank
            const rank = rankByAthlete.get(profile.user_id) || sampleRank
            const routeId = rank?.id || profile.user_id
            const athleteAge = profile.age ?? null
            const verified = profile.verification_level !== 'self'
            return <Link className="bds-card" key={profile.user_id} href={`/players/${routeId}`} style={{ background: 'white', border: '1px solid #dededb', borderRadius: 7, overflow: 'hidden', textDecoration: 'none', color: '#111', minWidth: 0 }}>
              <div style={{ height: 144, position: 'relative', background: profile.profile_image_url ? `url(${profile.profile_image_url}) center top/cover` : '#ececea', display: 'grid', placeItems: 'center', color: '#CC0001' }}>
                {!profile.profile_image_url && <PositionMark position={profile.position || ''} />}
                <span style={{ position: 'absolute', left: 8, top: 8, background: '#111', color: 'white', borderRadius: 4, padding: '3px 7px', fontFamily: 'var(--font-barlow)', fontSize: 10, fontWeight: 800 }}>{profile.position || '—'}</span>
                {verified && <span title={t('verified')} style={{ position: 'absolute', right: 8, top: 8, width: 24, height: 24, borderRadius: '50%', background: '#15803d', color: 'white', display: 'grid', placeItems: 'center' }}><CheckCircle2 size={15} /></span>}
              </div>
              <div style={{ padding: 11 }}>
                <div style={{ fontSize: 14, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.display_name}</div>
                <div style={{ marginTop: 5, display: 'flex', alignItems: 'center', gap: 4, color: '#777', fontSize: 10 }}><Users size={11} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{profile.current_team || t('noTeam')}</span></div>
                <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 4, color: '#777', fontSize: 10 }}><MapPin size={11} />{profile.province ? provinceName(profile.province, locale) : t('noProvince')}{athleteAge !== null && ` · ${t('age', { age: athleteAge })}`}</div>
                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #eee', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}><span style={{ fontSize: 9, color: '#999' }}>{t('power')}</span><b style={{ fontFamily: 'var(--font-oswald)', fontSize: 16, color: rank ? '#CC0001' : '#999' }}>{rank ? rank.pts.toLocaleString() : t('noPower')}</b></div>
              </div>
            </Link>
          })}
        </div>}
        <Pagination basePath="/athletes" page={page} hasNext={hasNext} params={{ search, province, position, age: ageGroup }} />
      </section>

    </main>
  )
}
