import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import PlayerCardBuilder, { type CardAction } from './PlayerCardBuilder'
import { CollectionTile, RarityFilter } from './CardCollection'
import { ChevronRight, ChevronsUp, TrendingUp } from 'lucide-react'
import { RARITIES, collectionView, parseCardTab, type CardTab, type Rarity } from '@/lib/card-collection'
import BrandMark from '@/components/BrandMark'
import CardGuide from '@/components/CardGuide'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'
import { signAvatarUrls } from '@/lib/athlete-avatar'
import { cardPosition, cardProvenance, playerCardStats, type CardSeason } from '@/lib/player-card'
import { calculateLevel, levelProgress } from '@/lib/digital-identity'
import { glassSceneStyle, PAGE_PHOTOS } from '@/lib/stock-photos'
import '../glass.css'
import './card.css'

type Profile = { full_name?: string | null; province?: string | null; team?: string | null; position?: string | null }
type AthleteProfile = { display_name?: string | null; position?: string | null; province?: string | null; current_team?: string | null; profile_image_url?: string | null; verification_level?: string | null; is_public?: boolean }
type PlayerRank = { id: string; player_name: string; position: string | null; ovr: number | null; pac: number | null; sho: number | null; pas: number | null; dri: number | null; def: number | null }
type Rating = { power_rating: number | null; matches_played: number | null; goals: number | null; assists: number | null; mvps: number | null }

export default async function PlayerCardPage(props: { searchParams?: Promise<{ tab?: string | string[]; rarity?: string | string[] }> }) {
  const searchParams = (await props.searchParams) ?? {}
  const tab = parseCardTab(searchParams.tab)
  const rawRarity = Array.isArray(searchParams.rarity) ? searchParams.rarity[0] : searchParams.rarity
  const rarity: Rarity | 'all' = RARITIES.includes(rawRarity as Rarity) ? rawRarity as Rarity : 'all'
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
  const [{ data: profile }, { data: athlete }, { data: rank }, { data: rating }, { data: progressRow }, { data: badgeRows }, { data: seasonRows }] = await Promise.all([
    supabase.from('profiles').select('full_name, province, team, position').eq('id', user.id).maybeSingle(),
    supabase.from('athlete_profiles').select('display_name, position, province, current_team, profile_image_url, verification_level, is_public').eq('user_id', user.id).maybeSingle(),
    supabase.from('player_ranks').select('id, player_name, position, ovr, pac, sho, pas, dri, def').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle(),
    supabase.from('player_ratings').select('power_rating, matches_played, goals, assists, mvps').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle(),
    // Level and XP, written only by verified match results (digital-identity-v1).
    supabase.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', user.id).maybeSingle(),
    // The collection (owner, 3 Nov 2026): badges (index athlete_id, awarded_at), and the seasons
    // with a verified match in player_ratings (index player_id, sport, season, SQL93), public or
    // private profile alike. Nine badges exist and one rating row per season, so both stay short.
    supabase.from('athlete_badges').select('badge_key, awarded_at').eq('athlete_id', user.id).order('awarded_at', { ascending: false }).limit(20),
    supabase.from('player_ratings').select('season').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).gt('matches_played', 0).order('season', { ascending: false }).limit(20),
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

  const progress = progressRow as { xp_total: number | null; current_level: number | null } | null
  const xp = progress?.xp_total ?? 0
  const level = progress?.current_level ?? calculateLevel(xp)
  const levelInfo = levelProgress(xp, level)
  const statCells = season && season.matches > 0 ? ([['matches', season.matches], ['goals', season.goals], ['assists', season.assists], ['mvps', season.mvps]] as const) : null
  const m = await getTranslations('mePage.stats')
  const collection = collectionView({
    // A list read is always an array; anything else (a failed read) counts as nothing earned.
    badges: (Array.isArray(badgeRows) ? badgeRows : []) as { badge_key: string; awarded_at: string | null }[],
    seasons: (Array.isArray(seasonRows) ? seasonRows : [] as { season: string }[]).map(row => row.season),
  })
  const initials = name.trim().split(/\s+/).slice(0, 2).map(part => [...part][0] ?? '').join('').toUpperCase() || '?'
  const tabHref = (next: CardTab, nextRarity?: Rarity | 'all') => {
    const params = new URLSearchParams()
    if (next !== 'mine') params.set('tab', next)
    if (nextRarity && nextRarity !== 'all') params.set('rarity', nextRarity)
    const query = params.toString()
    return query ? `/card?${query}` : '/card'
  }
  const tile = (card: (typeof collection.earned)[number]) => <CollectionTile key={card.id} card={card} name={name} initials={initials} photo={imageUrl} />
  const actions: CardAction[] = [
    { key: 'upgrade', href: '#pc-improve', label: t('actions.upgrade'), icon: <ChevronsUp size={20} aria-hidden="true" /> },
    { key: 'progress', href: '/career', label: t('actions.progress'), icon: <TrendingUp size={20} aria-hidden="true" /> },
  ]
  // The header of the collection and special views; the card view keeps the builder's own title.
  const tabs = <nav className="cd-tabs" aria-label={t('views.label')}>
    {(['mine', 'collection', 'special'] as const).map(item => <Link key={item} href={tabHref(item)} aria-current={item === tab ? 'page' : undefined} className={item === tab ? 'is-on' : undefined} scroll={false}>{t(`views.${item}`)}</Link>)}
  </nav>
  const summary = <div className="pc-summary">
    <div className="pc-level">
      {xp > 0 ? <>
        <div className="pc-level-row"><b>{t('summary.level', { level })}</b><span>{t('summary.xp', { xp: xp.toLocaleString('en-US'), target: levelInfo.nextFloor.toLocaleString('en-US') })}</span></div>
        <div className="pc-level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(levelInfo.percentage)} aria-label={t('summary.level', { level })}><i style={{ width: `${levelInfo.percentage}%` }} /></div>
      </> : <p>{t('summary.noXp')}</p>}
    </div>
    <section className="pc-season" aria-labelledby="pc-season">
      <h2 id="pc-season">{t('summary.statsTitle', { season: ACTIVE_SEASON })}</h2>
      {statCells
        ? <dl>{statCells.map(([key, value]) => <div key={key}><dd>{value.toLocaleString('en-US')}</dd><dt>{m(key)}</dt></div>)}</dl>
        : <p>{t('summary.noStats')}</p>}
      <p className="pc-season-note">{t('summary.statsNote')} · <Link href="/career">{t('summary.history')}</Link></p>
    </section>
    <section className="cd-strip" aria-labelledby="cd-strip">
      <div className="cd-strip-head"><h2 id="cd-strip">{t('collection.title', { count: collection.counts.all })}</h2><Link href={tabHref('collection')}>{t('collection.viewAll')}<ChevronRight size={16} aria-hidden="true" /></Link></div>
      {collection.earned.length > 0
        ? <ul className="cd-row">{collection.earned.slice(0, 8).map(tile)}</ul>
        : <p>{t('collection.empty')}</p>}
      <RarityFilter counts={collection.counts} active="all" href={key => tabHref('collection', key)} />
    </section>
    <section className="cd-improve" id="pc-improve" aria-labelledby="pc-improve-title">
      <h2 id="pc-improve-title">{t('improve.title')}</h2>
      <p>{t('improve.lead')}</p>
      <ul>{(['power', 'ovr', 'level', 'versions'] as const).map(key => <li key={key}>{t(`improve.${key}`)}</li>)}</ul>
    </section>
  </div>

  return (
    <main className="card-page gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.profile)}>
      <header className="card-page-header">
        <Link href="/" className="card-page-logo"><BrandMark size={22} />DOENSAI.com</Link>
        <div><Link href="/career" className="card-page-profile-link">{t('myHistory')}</Link><Link href="/profile/edit" className="card-page-profile-link">{t('editProfile')}</Link></div>
      </header>
      {tab === 'mine' ? <>
        {tabs}
        <PlayerCardBuilder
          userId={user.id}
          publicProfilePath={athleteProfile.is_public ? `/players/${playerRank?.id || user.id}` : null}
          seasonLabel={ACTIVE_SEASON}
          player={{
            name,
            position: cardPosition(playerRank?.position, athleteProfile.position, p.position),
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
          summary={summary}
          actions={actions}
        />
      </> : <section className="cd-page" aria-labelledby="cd-title">
        <h1 id="cd-title" className="cd-title">{t(`views.${tab}`)}</h1>
        <p className="cd-lead">{t('collection.lead')}</p>
        {tabs}
        {tab === 'collection' ? <>
          <RarityFilter counts={collection.counts} active={rarity} href={key => tabHref('collection', key)} />
          {(() => { const shown = collection.earned.filter(card => rarity === 'all' || card.rarity === rarity); return shown.length > 0 ? <ul className="cd-grid">{shown.map(tile)}</ul> : <p className="cd-empty">{t('collection.empty')}</p> })()}
          <h2 className="cd-h2">{t('collection.toEarn')}</h2>
          <ul className="cd-grid">{collection.locked.filter(card => rarity === 'all' || card.rarity === rarity).map(tile)}</ul>
        </> : <>
          <h2 className="cd-h2">{t('collection.specialTitle')}</h2>
          <p className="cd-lead">{t('collection.specialLead')}</p>
          <ul className="cd-grid">{[...collection.earned, ...collection.locked].filter(card => card.rarity === 'special' || card.rarity === 'legend').map(tile)}</ul>
        </>}
        <p className="cd-rules"><b>{t('collection.rules')}</b><br />{t('collection.rulesRarity')}</p>
      </section>}
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '0 16px 32px' }}><CardGuide /></div>
    </main>
  )
}
