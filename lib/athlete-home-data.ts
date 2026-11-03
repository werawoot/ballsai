import type { SupabaseClient } from '@supabase/supabase-js'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import { COACH_SKILL_KEYS } from './coach-skills'
import { weekXp, type SkillRow } from './athlete-home'
import { SKILL_KEYS } from './skill-ratings'

// The reads the athlete home (/profile) and profile tab (/me) add, each indexed and small:
// the season's rating behind the rank row (player_ratings, public read, written only by
// verified results), the card's five skills (player_ranks, by primary key), this week's XP
// (athlete_xp_events, owner read, index athlete_id + created_at, written only by verified
// results), and the latest coach-verified skill assessment for /me (athlete_skill_assessments,
// index athlete_id + created_at desc). A failed read leaves that part out and is logged; it
// never takes the page down.

// This season's verified totals (player_ratings), shown on /me and behind the rating change.
export type SeasonStats = { matches_played: number | null; goals: number | null; assists: number | null; mvps: number | null; last_rating_change: number | null }

export type CardSkills = Record<(typeof SKILL_KEYS)[number], number | null>

export type AthleteHomeExtras = {
  rating: SeasonStats | null
  cardSkills: CardSkills | null
  weekXp: number | null
}

// A week of verified matches gives a handful of XP rows; the cap only guards a runaway read.
const WEEK_XP_ROWS = 200

const logFailure = (event: string, error: { code?: string } | null) =>
  console.error(JSON.stringify({ level: 'error', event, code: error?.code ?? null }))

const SEASON_STATS = 'matches_played, goals, assists, mvps, last_rating_change'

/**
 * This season's verified totals, read by the account (player_id) as /card reads them, so a
 * private athlete's numbers show even without a public rank row (review, 3 Nov 2026).
 */
export async function fetchSeasonStats(client: SupabaseClient, userId: string): Promise<SeasonStats | null> {
  const { data, error } = await client.from('player_ratings').select(SEASON_STATS).eq('player_id', userId).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle()
  if (error) { logFailure('athlete_season_stats_read_failed', error); return null }
  return (data as SeasonStats | null) ?? null
}

export async function fetchAthleteHomeExtras(client: SupabaseClient, userId: string, rankId: string | null, weekStart: string): Promise<AthleteHomeExtras> {
  const [rating, skillResult, xpResult] = await Promise.all([
    fetchSeasonStats(client, userId),
    rankId ? client.from('player_ranks').select(SKILL_KEYS.join(', ')).eq('id', rankId).maybeSingle() : null,
    client.from('athlete_xp_events').select('xp_amount').eq('athlete_id', userId).gte('created_at', weekStart).limit(WEEK_XP_ROWS),
  ])
  if (skillResult?.error) logFailure('athlete_home_card_skills_read_failed', skillResult.error)
  if (xpResult.error) logFailure('athlete_home_week_xp_read_failed', xpResult.error)
  return {
    rating,
    cardSkills: skillResult && !skillResult.error ? (skillResult.data as CardSkills | null) ?? null : null,
    weekXp: xpResult.error ? null : weekXp(xpResult.data as { xp_amount: number | null }[]),
  }
}

/** The latest assessment a coach made (or performance gave), which the athlete accepted (SQL69). */
export async function fetchVerifiedSkillRow(client: SupabaseClient, userId: string): Promise<SkillRow | null> {
  const { data, error } = await client.from('athlete_skill_assessments').select(`${COACH_SKILL_KEYS.join(', ')}, source_level, created_at`)
    .eq('athlete_id', userId).eq('season', ACTIVE_SEASON).in('source_level', ['coach_verified', 'performance_verified'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) { logFailure('athlete_skills_read_failed', error); return null }
  return (data as SkillRow | null) ?? null
}
