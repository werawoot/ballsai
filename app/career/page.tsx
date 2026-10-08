import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Award, ChevronRight, CircleDot, Crown, Footprints, Medal, Play, ShieldCheck, Sparkles, Trophy, UserRound } from 'lucide-react'
import { getLocale, getTranslations } from 'next-intl/server'
import { IDENTITY_BADGES, calculateLevel, identityTierKey, levelProgress, unlockedBadgeKeys } from '@/lib/digital-identity'
import { ACTIVE_SEASON, ACTIVE_SPORT } from '@/lib/season'

type AthleteProfile = { display_name: string; created_at: string; verification_level: string }
type Rating = { id: string; power_rating: number; matches_played: number; wins: number; goals: number; assists: number; clean_sheets: number; mvps: number; confidence: string }
type RatingEvent = { id: string; created_at: string; rating_change: number; goals: number; assists: number; mvp: boolean; result: string }
type Achievement = { id: number; title: string; event_name: string | null; verification_status: string; created_at: string }
type Membership = { status: string; created_at: string; teams: { id: string; name: string; status: string; tournaments: { name: string | null }[] | null } | null }
type IdentityProgress = { xp_total: number; current_level: number }
type Video = { id: number; title: string; video_url: string; video_type: string; created_at: string }
type UploadedHighlight = { id: number; title: string; media_type: 'image' | 'video'; created_at: string }
type EarnedBadge = { badge_key: string; awarded_at: string }

function dateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'th-TH', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value))
}

export default async function CareerPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: (items) => items.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } },
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/career')
  const [t, tHome, locale] = await Promise.all([getTranslations('careerPage'), getTranslations('profileHome'), getLocale()])

  const [{ data: athlete }, { data: rating }, { data: achievements }, { data: memberships }, { data: progress }, { data: videos }, { data: highlights }, { data: earnedBadges }] = await Promise.all([
    supabase.from('athlete_profiles').select('display_name, created_at, verification_level').eq('user_id', user.id).maybeSingle(),
    supabase.from('player_ratings').select('id, power_rating, matches_played, wins, goals, assists, clean_sheets, mvps, confidence').eq('player_id', user.id).eq('sport', ACTIVE_SPORT).maybeSingle(),
    supabase.from('athlete_achievements').select('id, title, event_name, verification_status, created_at').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(12),
    supabase.from('team_members').select('status, created_at, teams(id, name, status, tournaments(name))').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(12),
    supabase.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', user.id).maybeSingle(),
    supabase.from('athlete_videos').select('id, title, video_url, video_type, created_at').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(6),
    supabase.from('athlete_highlights').select('id, title, media_type, created_at').eq('athlete_id', user.id).order('created_at', { ascending: false }).limit(6),
    supabase.from('athlete_badges').select('badge_key, awarded_at').eq('athlete_id', user.id).order('awarded_at', { ascending: false }),
  ])

  const typedAthlete = athlete as AthleteProfile | null
  const typedRating = rating as Rating | null
  const typedAchievements = (achievements ?? []) as Achievement[]
  const typedMemberships = (memberships ?? []) as unknown as Membership[]
  const typedProgress = progress as IdentityProgress | null
  const typedVideos = (videos ?? []) as Video[]
  const typedHighlights = (highlights ?? []) as UploadedHighlight[]
  const typedEarnedBadges = (earnedBadges ?? []) as EarnedBadge[]
  const { data: ratingEvents } = typedRating
    ? await supabase.from('rating_events').select('id, created_at, rating_change, goals, assists, mvp, result').eq('player_rating_id', typedRating.id).order('created_at', { ascending: false }).limit(20)
    : { data: [] }
  const typedEvents = (ratingEvents ?? []) as RatingEvent[]
  const verifiedAchievements = typedAchievements.filter(item => item.verification_status === 'verified')
  const confirmedTeams = typedMemberships.filter(membership => membership.status === 'accepted' && membership.teams?.status === 'confirmed')
  const name = typedAthlete?.display_name || t('nameFallback')
  const fallbackXp = (typedRating?.matches_played ?? 0) * 30 + (typedRating?.wins ?? 0) * 20 + (typedRating?.goals ?? 0) * 10 + (typedRating?.assists ?? 0) * 8 + (typedRating?.mvps ?? 0) * 35
  const xpTotal = typedProgress?.xp_total ?? fallbackXp
  const level = typedProgress?.current_level ?? calculateLevel(xpTotal)
  const levelInfo = levelProgress(xpTotal, level)
  const calculatedBadgeKeys = unlockedBadgeKeys({
    hasProfile: Boolean(typedAthlete), matchesPlayed: typedRating?.matches_played, wins: typedRating?.wins,
    goals: typedRating?.goals, assists: typedRating?.assists, cleanSheets: typedRating?.clean_sheets,
    mvps: typedRating?.mvps, powerRating: typedRating?.power_rating,
  })
  const earnedBadgeKeys = new Set(typedEarnedBadges.map(item => item.badge_key))
  const unlockedKeys = new Set([...calculatedBadgeKeys, ...earnedBadgeKeys])

  const badges = IDENTITY_BADGES.map((badge, index) => ({
    ...badge,
    icon: index === 0 ? <UserRound /> : index === 1 ? <Footprints /> : index === 2 ? <Trophy /> : index === 3 ? <Sparkles /> : <Medal />,
    unlocked: unlockedKeys.has(badge.key),
    verified: earnedBadgeKeys.has(badge.key),
  }))

  const resultWord = (result: string) => t(`result.${result === 'win' || result === 'draw' ? result : 'loss'}`)
  const eventDetail = (event: RatingEvent) => event.goals > 0 ? t('eventGoals', { count: event.goals }) : event.assists > 0 ? t('eventAssists', { count: event.assists }) : event.mvp ? t('eventMvp') : t('eventRecorded')
  const events = [
    ...(typedAthlete ? [{ id: 'profile', at: typedAthlete.created_at, icon: <UserRound />, title: t('eventStart'), detail: t('eventWelcome', { name }) }] : []),
    ...confirmedTeams.map(membership => ({ id: `team-${membership.teams?.id}`, at: membership.created_at, icon: <ShieldCheck />, title: t('eventJoined', { tournament: membership.teams?.tournaments?.[0]?.name || t('eventJoinedFallback') }), detail: t('eventTeam', { team: membership.teams?.name || t('eventTeamFallback') }) })),
    ...typedEvents.map(event => ({ id: `rating-${event.id}`, at: event.created_at, icon: <Sparkles />, title: t('eventRating', { change: `${event.rating_change >= 0 ? '+' : ''}${event.rating_change}` }), detail: `${resultWord(event.result)} · ${eventDetail(event)}` })),
    ...verifiedAchievements.map(item => ({ id: `achievement-${item.id}`, at: item.created_at, icon: <Award />, title: item.title, detail: item.event_name || t('eventAchievement') })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  const videoType = (type: string) => (type === 'highlight' || type === 'match' || type === 'training' ? t(`videoType.${type}`) : type)

  return <main className="career-page">
    <header className="career-header"><Link href="/" className="career-logo"><Trophy size={19} /> BallDoenSai.com</Link><div><Link href="/ranking?view=trending" className="career-hall-link"><Crown size={15} /> {t('trending')}</Link><Link href="/card" className="career-card-link">{t('cardLink')} <ChevronRight size={15} /></Link></div></header>
    <section className="career-hero"><div className="career-hero-orbit" /><div className="career-hero-copy"><p>{t('eyebrow', { season: ACTIVE_SEASON })}</p><h1>{t('titleLead')}<br /><em>{name}</em></h1><span>{t('intro')}</span></div><div className="career-rating"><small>{t('ratingLabel')}</small><b>{typedRating?.power_rating?.toLocaleString() || '—'}</b><span>{typedRating ? t('ratingMatches', { matches: typedRating.matches_played, confidence: t(`confidence.${typedRating.confidence === 'active' || typedRating.confidence === 'full' ? typedRating.confidence : 'provisional'}`) }) : t('noRating')}</span></div></section>

    <section className="career-content">
      <section className="identity-level-card">
        <div className="identity-level-number"><span>{t('level')}</span><b>{level.toString().padStart(2, '0')}</b></div>
        <div className="identity-level-copy"><span>{tHome(`tiers.${identityTierKey(level)}`)}</span><h2>{t('levelTitle')}</h2><p>{t('levelProgress', { xp: xpTotal.toLocaleString(), remaining: levelInfo.remaining.toLocaleString(), next: level + 1 })}</p><div className="identity-level-track"><i style={{ width: `${levelInfo.percentage}%` }} /></div></div>
        <div className="identity-level-note">{t('levelNote')}</div>
      </section>
      <div className="career-section-heading"><div><span>{t('badgesEyebrow')}</span><h2>{t('badgesTitle')}</h2></div><p>{t('badgesCount', { unlocked: badges.filter(badge => badge.unlocked).length, total: badges.length })}</p></div>
      <div className="career-badges">{badges.map(badge => <article className={`career-badge ${badge.unlocked ? 'is-unlocked' : ''}`} key={badge.key}><div>{badge.icon}</div><b>{t(`badges.${badge.key}.name`)}</b><p>{t(`badges.${badge.key}.description`)}</p>{badge.unlocked ? <small>{t('badgeXp', { xp: badge.xp, state: badge.verified ? t('badgeVerified') : t('badgeUnlocked') })}</small> : <small>{t('badgeLocked')}</small>}</article>)}</div>

      <div className="career-section-heading career-timeline-heading"><div><span>{t('storyEyebrow')}</span><h2>{t('storyTitle')}</h2></div><Link href="/profile/edit#achievements" className="tap-44">{t('addAchievement')} <ChevronRight size={15} /></Link></div>
      {events.length ? <div className="career-timeline">{events.map(event => <article key={event.id} className="career-event"><div className="career-event-pin">{event.icon}</div><div><time>{dateLabel(event.at, locale)}</time><h3>{event.title}</h3><p>{event.detail}</p></div></article>)}</div> : <div className="career-empty"><CircleDot size={30} /><h3>{t('emptyTitle')}</h3><p>{t('emptyBody')}</p><Link href="/profile/edit">{t('emptyAction')}</Link></div>}

      <div className="career-section-heading career-timeline-heading"><div><span>{t('highlightsEyebrow')}</span><h2>{t('highlightsTitle')}</h2></div><Link href="/profile/edit#highlights" className="tap-44">{t('addHighlight')} <ChevronRight size={15} /></Link></div>
      {typedVideos.length || typedHighlights.length ? <div className="identity-highlight-grid">{typedHighlights.map(item => <a key={`upload-${item.id}`} href={`/api/highlights/${item.id}/media`} target="_blank" rel="noreferrer" className="identity-highlight-card"><span><Play size={17} fill="currentColor" /></span><small>{item.media_type === 'video' ? t('uploadedVideo') : t('uploadedPhoto')}</small><h3>{item.title}</h3><p>{t('openHighlight')}</p></a>)}{typedVideos.map(video => <a key={`link-${video.id}`} href={video.video_url} target="_blank" rel="noreferrer" className="identity-highlight-card"><span><Play size={17} fill="currentColor" /></span><small>{videoType(video.video_type)}</small><h3>{video.title}</h3><p>{t('openHighlight')}</p></a>)}</div> : <div className="identity-highlight-empty"><Play size={23} /><div><b>{t('highlightsEmptyTitle')}</b><p>{t('highlightsEmptyBody')}</p></div><Link href="/profile/edit#highlights">{t('addHighlight')}</Link></div>}
    </section>
  </main>
}
