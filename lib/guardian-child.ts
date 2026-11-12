import type { SupabaseClient } from '@supabase/supabase-js'
import { UUID_PATTERN } from '@/lib/venue-photo-errors'

// A child this guardian may follow: an accepted, consented guardian_links row (sql/21) for this
// pair, the same test is_accepted_guardian_for() makes in RLS. The
// pages for one child ask this first and show nothing (404) for anyone else, so a guessed id
// reveals neither the child's name nor whether the athlete exists. RLS (sql/63, 95, 96) applies
// the same rule again to every row read afterwards.

export type GuardianChild = { athleteId: string; displayName: string | null }

export async function fetchAcceptedChild(client: SupabaseClient, guardianId: string, athleteId: string): Promise<GuardianChild | null> {
  if (!UUID_PATTERN.test(athleteId)) return null
  const { data, error } = await client.from('guardian_links')
    .select('athlete_id, athlete_profiles!guardian_links_athlete_id_fkey(display_name)')
    .eq('guardian_id', guardianId).eq('athlete_id', athleteId).eq('status', 'accepted').not('consent_at', 'is', null)
    .limit(1).maybeSingle()
  if (error) {
    console.error(JSON.stringify({ level: 'error', event: 'guardian_child_failed', code: (error as { code?: string }).code ?? null }))
    return null
  }
  if (!data) return null
  const profile = (data as { athlete_profiles?: { display_name?: string | null } | { display_name?: string | null }[] | null }).athlete_profiles
  const name = Array.isArray(profile) ? profile[0]?.display_name : profile?.display_name
  return { athleteId, displayName: name || null }
}
