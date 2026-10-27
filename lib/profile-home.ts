import type { SupabaseClient } from '@supabase/supabase-js'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import { PUBLIC_PROFILE_COLUMNS, fetchMyAthletePrivate, type AthletePrivate } from './athlete-private'
import { fetchMyTeamMemberships, membershipFromRow, type MembershipRow, type MyTeamMembership } from './my-team-memberships'
import { fetchMyTraining, type Enrollment, type MyTraining } from './training/data'

// The signed-in person's own /profile data (T59). my_profile_home (sql/91) returns it in one
// call under the caller's own RLS; before that file is applied the function is missing and
// the page's old separate reads run instead, with the same result.

export type ProfileRow = { full_name?: string | null; role?: string | null; onboarding_persona?: string | null }
export type ProfileHome = {
  profile: ProfileRow | null
  // Public columns only (PUBLIC_PROFILE_COLUMNS); the birth date comes through `private`.
  athlete: Record<string, unknown> | null
  private: AthletePrivate | null
  rank: { id: string; player_name: string; position: string; ovr: number; pts: number } | null
  progress: { xp_total: number; current_level: number } | null
  highlights: number
  videos: number
  pendingGuardian: number
  memberships: MyTeamMembership[]
  training: MyTraining
}

type HomeJson = {
  profile: ProfileRow | null
  athlete: Record<string, unknown> | null
  private: AthletePrivate | null
  rank: ProfileHome['rank']
  progress: ProfileHome['progress']
  highlights: number | null
  videos: number | null
  pending_guardian: number | null
  memberships: MembershipRow[] | null
  training: { enrollments: Enrollment[] | null; checkins: { enrollment_id: string; session_date: string }[] | null } | null
}

const MISSING = ['PGRST202', '42883']

export async function fetchProfileHome(client: SupabaseClient, userId: string): Promise<ProfileHome> {
  const { data, error } = await client.rpc('my_profile_home', { p_sport: ACTIVE_SPORT, p_season: ACTIVE_SEASON })
  if (!error) {
    const home = (data ?? {}) as HomeJson
    const checkins: Record<string, string[]> = {}
    for (const row of home.training?.checkins ?? []) (checkins[row.enrollment_id] ??= []).push(row.session_date)
    return {
      profile: home.profile ?? null,
      athlete: home.athlete ?? null,
      private: home.private ? { birth_date: home.private.birth_date ?? null, guardian_consent_at: home.private.guardian_consent_at ?? null } : null,
      rank: home.rank ?? null,
      progress: home.progress ?? null,
      highlights: home.highlights ?? 0,
      videos: home.videos ?? 0,
      pendingGuardian: home.pending_guardian ?? 0,
      memberships: (home.memberships ?? []).map(membershipFromRow),
      training: { available: true, enrollments: home.training?.enrollments ?? [], checkins },
    }
  }
  if (!MISSING.includes(error.code ?? '')) throw error
  return fetchProfileHomeSeparately(client, userId)
}

const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
  const { count: value, error } = await query
  return error ? 0 : value ?? 0
}

// Before sql/91: the reads /profile made one by one. Delete once SQL91 is on Production.
async function fetchProfileHomeSeparately(client: SupabaseClient, userId: string): Promise<ProfileHome> {
  const [profileResult, athleteResult, rankResult, membershipResult, progressResult, highlights, videos, pendingGuardian] = await Promise.all([
    client.from('profiles').select('full_name, role, onboarding_persona').eq('id', userId).maybeSingle(),
    client.from('athlete_profiles').select(PUBLIC_PROFILE_COLUMNS).eq('user_id', userId).maybeSingle(),
    client.from('player_ranks').select('id, player_name, position, ovr, pts').eq('player_id', userId).eq('sport', ACTIVE_SPORT).eq('season', ACTIVE_SEASON).maybeSingle(),
    fetchMyTeamMemberships(client as never, userId, 5),
    client.from('athlete_progress').select('xp_total, current_level').eq('athlete_id', userId).maybeSingle(),
    count(client.from('athlete_highlights').select('id', { count: 'exact', head: true }).eq('athlete_id', userId)),
    count(client.from('athlete_videos').select('id', { count: 'exact', head: true }).eq('athlete_id', userId)),
    count(client.from('guardian_links').select('id', { count: 'exact', head: true }).eq('athlete_id', userId).eq('status', 'pending')),
  ])
  const athlete = (athleteResult.data ?? null) as Record<string, unknown> | null
  // The birth date and consent time come only through my_athlete_private (sql/58).
  const [athletePrivate, training] = athlete ? await Promise.all([
    fetchMyAthletePrivate(client).catch(error => {
      console.error(JSON.stringify({ level: 'error', event: 'athlete_private_read_failed', code: error?.code ?? null }))
      return { birth_date: null, guardian_consent_at: null }
    }),
    fetchMyTraining(client, userId),
  ]) : [null, { available: false, enrollments: [], checkins: {} } satisfies MyTraining]
  return {
    profile: (profileResult.data ?? null) as ProfileRow | null,
    athlete,
    private: athletePrivate,
    rank: (rankResult.data ?? null) as ProfileHome['rank'],
    progress: (progressResult.data ?? null) as ProfileHome['progress'],
    highlights,
    videos,
    pendingGuardian,
    memberships: membershipResult.memberships,
    training,
  }
}
