import type { SupabaseClient } from '@supabase/supabase-js'
import { roleHome, type CoachTeam, type HomeFacts, type HomeKind, type RoleHome, type RoleStats } from './role-home'

// The facts "ของฉัน" needs for each role (lib/role-home.ts). Every read is a head count or a
// one-row lookup scoped by RLS to the signed-in person, so the page costs the same for a
// coach with one team as for an organizer with three hundred tournaments. A failed read is
// reported as a failure: showing "create your first tournament" to an organizer whose
// tournaments could not be read would be a wrong answer, not an empty one.

type Counted = PromiseLike<{ count: number | null; error: unknown }>
type Row = { id: string; name: string; status: string }

async function counts(...queries: Counted[]): Promise<number[] | null> {
  const results = await Promise.all(queries)
  if (results.some(result => result.error)) return null
  return results.map(result => result.count ?? 0)
}

export type FactsResult<K extends Exclude<HomeKind, 'athlete'>> = { ok: true; facts: HomeFacts[K] } | { ok: false }

export async function guardianFacts(client: SupabaseClient, userId: string): Promise<FactsResult<'guardian'>> {
  const byStatus = (status: string) => client.from('guardian_links').select('id', { count: 'exact', head: true }).eq('guardian_id', userId).eq('status', status)
  const result = await counts(byStatus('accepted'), byStatus('pending'))
  return result ? { ok: true, facts: { accepted: result[0], pending: result[1] } } : { ok: false }
}

export async function coachFacts(client: SupabaseClient, userId: string): Promise<FactsResult<'coach'>> {
  // Only the newest team decides what to do next, so one row is read, not the whole list.
  const { data, error } = await client.from('teams').select('id, name, status').eq('created_by', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).limit(1)
  if (error) return { ok: false }
  const newest = ((data ?? []) as Row[])[0]
  if (!newest) return { ok: true, facts: { teams: [] } }
  const byStatus = (status: string) => client.from('team_members').select('id', { count: 'exact', head: true }).eq('team_id', newest.id).eq('status', status)
  const result = await counts(byStatus('accepted'), byStatus('pending'))
  if (!result) return { ok: false }
  const team: CoachTeam = { id: newest.id, name: newest.name, status: newest.status, accepted: result[0], pending: result[1] }
  return { ok: true, facts: { teams: [team] } }
}

export async function organizerFacts(client: SupabaseClient, userId: string): Promise<FactsResult<'organizer'>> {
  // A team is the organizer's through its tournament; the inner join filters in the database.
  const result = await counts(
    client.from('tournaments').select('id', { count: 'exact', head: true }).eq('organizer_id', userId),
    client.from('teams').select('id, tournaments!inner(organizer_id)', { count: 'exact', head: true }).eq('tournaments.organizer_id', userId).eq('status', 'pending'),
  )
  return result ? { ok: true, facts: { tournaments: result[0], pendingTeams: result[1] } } : { ok: false }
}

export async function venueFacts(client: SupabaseClient, userId: string): Promise<FactsResult<'venue'>> {
  // Inner joins keep the requests to the owner's own venues; RLS also lets an owner read the
  // requests they sent to other venues, which are not inbox items.
  const result = await counts(
    client.from('venue_profiles').select('id', { count: 'exact', head: true }).eq('owner_id', userId),
    client.from('venue_booking_requests')
      .select('id, venue_slots!inner(venue_courts!inner(venue_profiles!inner(owner_id)))', { count: 'exact', head: true })
      .eq('venue_slots.venue_courts.venue_profiles.owner_id', userId).eq('status', 'pending'),
  )
  return result ? { ok: true, facts: { venues: result[0], pendingRequests: result[1] } } : { ok: false }
}

export type LoadedHome = { home: RoleHome; stats?: RoleStats }

/** The home for a non-athlete role, or null when its facts could not be read. */
export async function loadRoleHome(client: SupabaseClient, kind: Exclude<HomeKind, 'athlete'>, userId: string): Promise<LoadedHome | null> {
  switch (kind) {
    case 'guardian': {
      const result = await guardianFacts(client, userId)
      return result.ok ? { home: roleHome('guardian', result.facts), stats: { key: 'guardian', values: { ...result.facts } } } : null
    }
    case 'coach': {
      const result = await coachFacts(client, userId)
      if (!result.ok) return null
      const team = result.facts.teams[0]
      return { home: roleHome('coach', result.facts), stats: team ? { key: 'coach', values: { team: team.name, accepted: team.accepted, pending: team.pending } } : undefined }
    }
    case 'organizer': {
      const result = await organizerFacts(client, userId)
      return result.ok ? { home: roleHome('organizer', result.facts) } : null
    }
    case 'venue': {
      const result = await venueFacts(client, userId)
      return result.ok ? { home: roleHome('venue', result.facts) } : null
    }
    default:
      return { home: roleHome('sponsor', {}) }
  }
}
