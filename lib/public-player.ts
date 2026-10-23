import type { SupabaseClient } from '@supabase/supabase-js'
import { isSampleId, samplePlayerRanks, showDemoData } from './sample-data'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import { PUBLIC_PROFILE_COLUMNS, fetchAthleteAge } from './athlete-private'
import { withAvatarUrls } from './athlete-avatar'
import { seasonSummary } from './player-profile'
import { FORM_EVENT_LIMIT, type RatingEventRow } from './player-form'
import { fetchRankPosition } from './public-ranking-page'

// A public athlete page (/players/[id]) for viewers with no session comes from one shared,
// cached copy read with the anon key (lib/public-data.ts), so a much-shared link costs the
// database nothing between refreshes. A signed-in viewer may be the athlete, a guardian or
// a coach, whose RLS shows more than the public copy, so they read with their own session.

// Supabase's session cookie, whole or split into .0, .1 chunks. The OAuth code verifier
// (`…-auth-token-code-verifier`) is set before sign-in finishes and is not a session.
const SESSION_COOKIE = /^sb-[a-z0-9]+-auth-token(\.\d+)?$/

export function servesSharedPlayerCopy(cookieNames: string[]) {
  return !cookieNames.some(name => SESSION_COOKIE.test(name))
}

export type PlayerRecord = {
  id: string
  player_id?: string | null
  player_name: string
  team: string | null
  province: string | null
  position: string | null
  sport?: string | null
  season?: string | null
  ovr: number | null
  pts: number | null
  pac: number | null
  sho: number | null
  pas: number | null
  dri: number | null
  def: number | null
}

export type AthleteProfile = {
  user_id: string
  display_name: string
  position?: string | null
  province?: string | null
  height_cm?: number | null
  weight_kg?: number | null
  current_team?: string | null
  bio?: string | null
  profile_image_url?: string | null
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}

export type AthleteVideo = { id: number; title: string; video_url: string; video_type: string }
export type AthleteHighlight = { id: number; title: string; media_type: 'image' | 'video' }
export type AthleteAchievement = { id: number; title: string; event_name?: string | null; achievement_year?: number | null; verification_status: string }
export type SkillAssessment = { speed?: number | null; stamina?: number | null; strength?: number | null; technique?: number | null; vision?: number | null; source_level: string }
export type IdentityProgress = { xp_total: number; current_level: number }
export type AthleteBadge = { badge_key: string; awarded_at: string }
export type SeasonRating = { id: string } & Partial<Record<'power_rating' | 'matches_played' | 'wins' | 'draws' | 'losses' | 'goals' | 'assists' | 'clean_sheets' | 'mvps', number | null>>

export type PublicPlayerPage = {
  rank: PlayerRecord | null
  profile: AthleteProfile | null
  videos: AthleteVideo[]
  highlights: AthleteHighlight[]
  achievements: AthleteAchievement[]
  skill: SkillAssessment | null
  progress: IdentityProgress | null
  badges: AthleteBadge[]
  age: number | null
  rating: SeasonRating | null
  position: { rankId: string; position: number; page: number } | null
  events: RatingEventRow[]
}

const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

// Everything /players/[id] shows, read as `client` may read it: the anon client for the
// shared copy, the viewer's own session otherwise. The id is a player_ranks id or, for an
// athlete with no rank row yet (a STARTER card), their user id. Null when neither is
// visible to this client, a private profile included; the page then sends the viewer on.
export async function fetchPublicPlayer(client: SupabaseClient, id: string): Promise<PublicPlayerPage | null> {
  // A failed read throws rather than reading as "not found": the shared copy is cached,
  // and a cached miss would send every visitor away until it expires.
  const found = <T>(result: { data: T | null; error: unknown }) => {
    if (result.error) throw result.error
    return result.data
  }
  const player = showDemoData && isSampleId(id)
    ? samplePlayerRanks.find(item => item.id === id) ?? null
    : found(await client.from('player_ranks').select('*').eq('id', id).maybeSingle())

  const routeIsUserId = USER_ID.test(id)
  const linkedPlayerResult = !player && routeIsUserId
    ? { data: found(await client.from('player_ranks').select('*').eq('player_id', id).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle()) }
    : { data: null }
  const rank = (player || linkedPlayerResult.data) as PlayerRecord | null
  const athleteId = rank?.player_id || (routeIsUserId ? id : null)
  const rankSport = rank?.sport || ACTIVE_SPORT
  const rankSeason = rank?.season || ACTIVE_SEASON

  const [profileResult, videoResult, highlightResult, achievementResult, skillResult, progressResult, badgeResult, age, ratingResult, position] = await Promise.all([
    athleteId ? client.from('athlete_profiles').select(PUBLIC_PROFILE_COLUMNS).eq('user_id', athleteId).maybeSingle() : null,
    athleteId ? client.from('athlete_videos').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(6) : null,
    athleteId ? client.from('athlete_highlights').select('id, title, media_type').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(6) : null,
    athleteId ? client.from('athlete_achievements').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(8) : null,
    athleteId ? client.from('athlete_skill_assessments').select('*').eq('athlete_id', athleteId).order('created_at', { ascending: false }).limit(1).maybeSingle() : null,
    athleteId ? client.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', athleteId).maybeSingle() : null,
    athleteId ? client.from('athlete_badges').select('badge_key, awarded_at').eq('athlete_id', athleteId).order('awarded_at', { ascending: false }) : null,
    // An age, never the birth date: public_athlete_age (sql/58) works it out in the database.
    athleteId ? fetchAthleteAge(client, athleteId) : null,
    // This season's verified results behind the rank row (public read, written only by
    // verified match results).
    rank && !isSampleId(rank.id) ? client.from('player_ratings').select('id, power_rating, matches_played, wins, draws, losses, goals, assists, clean_sheets, mvps').eq('player_rank_id', rank.id).eq('sport', rankSport).eq('season', rankSeason).maybeSingle() : null,
    rank && typeof rank.pts === 'number' && !isSampleId(rank.id) ? fetchRankPosition(client, { sport: rankSport, season: rankSeason, id: rank.id, pts: rank.pts }).catch(() => null) : null,
  ])
  // The photo is a private object (T51): signed only if this client may see it.
  const profileRow = profileResult ? found(profileResult) : null
  const profile = profileRow ? (await withAvatarUrls(client, [profileRow as unknown as AthleteProfile]))[0] : null
  if (!rank && !profile) return null

  const rating = (ratingResult?.data ?? null) as SeasonRating | null
  // Match by match, newest first: one indexed read (player_rating_id, created_at desc).
  const eventsResult = rating && seasonSummary(rating)
    ? await client.from('rating_events').select('created_at, result, rating_after, rating_change, goals, assists, mvp, clean_sheet').eq('player_rating_id', rating.id).order('created_at', { ascending: false }).limit(FORM_EVENT_LIMIT)
    : null

  return {
    rank,
    profile,
    videos: (videoResult?.data ?? []) as AthleteVideo[],
    highlights: (highlightResult?.data ?? []) as AthleteHighlight[],
    achievements: (achievementResult?.data ?? []) as AthleteAchievement[],
    skill: (skillResult?.data ?? null) as SkillAssessment | null,
    progress: (progressResult?.data ?? null) as IdentityProgress | null,
    badges: (badgeResult?.data ?? []) as AthleteBadge[],
    age: age ?? null,
    rating,
    position: position ?? null,
    events: (eventsResult?.data ?? []) as RatingEventRow[],
  }
}
