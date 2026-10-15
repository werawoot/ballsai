import type { SupabaseClient } from '@supabase/supabase-js'
import { roleHome, urgentTeamFirst, type CoachTeam, type HomeFacts, type HomeKind, type RoleHome, type RoleStats } from './role-home'

// The facts "ของฉัน" needs for each role (lib/role-home.ts). Every read is a head count or a
// one-row lookup scoped by RLS to the signed-in person, so the page costs the same for a
// coach with one team as for an organizer with three hundred tournaments. A failed read is
// reported as a failure: showing "create your first tournament" to an organizer whose
// tournaments could not be read would be a wrong answer, not an empty one.

type Counted = PromiseLike<{ count: number | null; error: unknown }>
type Row = { id: string; name: string; status: string }

// A coach's teams read for the home card, and the member rows counted for them
// (an entry holds at most 60 athletes, sql/78).
const COACH_TEAMS_READ = 25
const COACH_MEMBERS_READ = COACH_TEAMS_READ * 60

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
  // The card is about the team that needs the coach most (urgentTeamFirst, report 11), so the
  // newest COACH_TEAMS_READ teams are read, then their accepted and pending members in one
  // query. A coach has at most 20 own teams (sql/78) plus one entry per tournament, so this
  // stays bounded. teams.kind exists once SQL78 is in: then a coach can create their own team.
  const newest = (columns: string) => client.from('teams').select(columns).eq('created_by', userId)
    .order('created_at', { ascending: false }).order('id', { ascending: true }).limit(COACH_TEAMS_READ)
  const first = await newest('id, name, status, kind')
  const ownTeams = !first.error
  const { data, error } = ownTeams ? first : await newest('id, name, status')
  if (error) return { ok: false }
  const rows = (data ?? []) as unknown as (Row & { kind?: 'club' | 'entry' })[]
  if (rows.length === 0) return { ok: true, facts: { teams: [], ownTeams } }
  const { data: memberRows, error: memberError } = await client.from('team_members').select('team_id, status')
    .in('team_id', rows.map(row => row.id)).in('status', ['accepted', 'pending']).limit(COACH_MEMBERS_READ)
  if (memberError) return { ok: false }
  const tally = new Map<string, { accepted: number; pending: number }>()
  for (const member of (memberRows ?? []) as { team_id: string; status: string }[]) {
    const entry = tally.get(member.team_id) ?? { accepted: 0, pending: 0 }
    if (member.status === 'accepted') entry.accepted += 1
    else entry.pending += 1
    tally.set(member.team_id, entry)
  }
  const teams: CoachTeam[] = rows.map(row => ({ id: row.id, name: row.name, status: row.status, kind: row.kind, ...(tally.get(row.id) ?? { accepted: 0, pending: 0 }) }))
  return { ok: true, facts: { teams: urgentTeamFirst(teams), ownTeams } }
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
      // "0 linked · 0 waiting" says nothing to someone who has not linked yet.
      return result.ok ? { home: roleHome('guardian', result.facts), stats: result.facts.accepted + result.facts.pending > 0 ? { key: 'guardian', values: { ...result.facts } } : undefined } : null
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
