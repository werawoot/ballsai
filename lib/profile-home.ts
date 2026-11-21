import type { SupabaseClient } from '@supabase/supabase-js'
import { ACTIVE_SEASON, ACTIVE_SPORT } from './season'
import type { AthletePrivate } from './athlete-private'
import { membershipFromRow, type MembershipRow, type MyTeamMembership } from './my-team-memberships'
import type { Enrollment, MyTraining } from './training/data'

// The signed-in person's own /profile data (T59). my_profile_home (sql/91, on Staging and
// Production since 23 Oct 2026) returns it in one call under the caller's own RLS. A failed call
// is thrown to the page's error boundary, never answered with ten separate reads.

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

export async function fetchProfileHome(client: SupabaseClient): Promise<ProfileHome> {
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
  throw error
}
