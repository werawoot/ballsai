import type { SupabaseClient } from '@supabase/supabase-js'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import { COACH_SKILL_KEYS } from './coach-skills'
import type { SkillRow } from './athlete-home'

// The two reads the athlete home adds to /profile, both indexed and both one row:
// the season's rating behind the rank row (player_ratings, public read, written only by
// verified results) and the latest coach-verified skill assessment (athlete_skill_assessments,
// the athlete reads their own; index athlete_id, created_at desc). A failed read leaves that
// part out and is logged; it never takes the page down.

export type AthleteHomeExtras = {
  rating: { matches_played: number | null; last_rating_change: number | null } | null
  skills: SkillRow | null
}

const logFailure = (event: string, error: { code?: string } | null) =>
  console.error(JSON.stringify({ level: 'error', event, code: error?.code ?? null }))

export async function fetchAthleteHomeExtras(client: SupabaseClient, userId: string, rankId: string | null): Promise<AthleteHomeExtras> {
  const [ratingResult, skillResult] = await Promise.all([
    rankId
      ? client.from('player_ratings').select('matches_played, last_rating_change').eq('player_rank_id', rankId).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle()
      : null,
    client.from('athlete_skill_assessments').select(`${COACH_SKILL_KEYS.join(', ')}, source_level, created_at`)
      .eq('athlete_id', userId).in('source_level', ['coach_verified', 'performance_verified'])
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  if (ratingResult?.error) logFailure('athlete_home_rating_read_failed', ratingResult.error)
  if (skillResult.error) logFailure('athlete_home_skills_read_failed', skillResult.error)
  return {
    rating: ratingResult && !ratingResult.error ? (ratingResult.data as AthleteHomeExtras['rating']) ?? null : null,
    skills: skillResult.error ? null : (skillResult.data as SkillRow | null) ?? null,
  }
}
