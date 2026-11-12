import type { SupabaseClient } from '@supabase/supabase-js'

// A child this guardian may follow: an accepted guardian_links row (sql/21) for this pair. The
// pages for one child ask this first and show nothing (404) for anyone else, so a guessed id
// reveals neither the child's name nor whether the athlete exists. RLS (sql/63, 95, 96) applies
// the same rule again to every row read afterwards.

export type GuardianChild = { athleteId: string; displayName: string | null }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function fetchAcceptedChild(client: SupabaseClient, guardianId: string, athleteId: string): Promise<GuardianChild | null> {
  if (!UUID.test(athleteId)) return null
  const { data, error } = await client.from('guardian_links')
    .select('athlete_id, athlete_profiles!guardian_links_athlete_id_fkey(display_name)')
    .eq('guardian_id', guardianId).eq('athlete_id', athleteId).eq('status', 'accepted')
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
