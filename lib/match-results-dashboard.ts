import type { SupabaseClient } from '@supabase/supabase-js'
import { FIRST_MATCH_RATING, newPlayerKey, profilePosition } from '@/lib/first-match-rank'

// /dashboard/results records a result for one tournament at a time. An organizer picks
// from their own tournaments and an admin from every tournament in the country, so the
// picker is paged and searchable, and only the chosen tournament's teams, rosters and
// history are loaded.
export const RESULT_TOURNAMENTS_PAGE_SIZE = 10
export const RESULT_HISTORY_LIMIT = 20
// A large tournament can roster over a thousand athletes. Ids go to PostgREST in the URL,
// so they are sent in batches small enough for any request, and every batch is read.
export const ID_BATCH_SIZE = 100

export type ResultTournament = { id: string; name: string; organizer_id: string }
export type ResultTeam = { id: string; name: string; tournament_id: string; status: string }
// isNew: a roster member with no rank row yet; `id` is then newPlayerKey(athlete) and the
// row is created by this first verified match (T32, sql/61).
export type ResultPlayer = { id: string; player_id: string | null; player_name: string; position: string; pts: number; teamId: string; isNew?: boolean }
export type ResultRow = {
  id: string
  tournament_id: string
  team_a_id: string
  team_b_id: string
  team_a_score: number
  team_b_score: number
  status: string
  created_at: string
}

const batches = <T,>(items: T[]) => Array.from({ length: Math.ceil(items.length / ID_BATCH_SIZE) }, (_, index) => items.slice(index * ID_BATCH_SIZE, (index + 1) * ID_BATCH_SIZE))

// Runs one query per batch of ids and joins the rows; any failed batch fails the read,
// so a partial roster is never shown as the whole one.
async function inBatches<T>(ids: string[], query: (batch: string[]) => PromiseLike<{ data: unknown; error: unknown }>) {
  const results = await Promise.all(batches(ids).map(query))
  const rows: T[] = []
  for (const result of results) {
    if (result.error) throw result.error
    rows.push(...((result.data ?? []) as T[]))
  }
  return rows
}

type PageOptions = { userId: string; isAdmin: boolean; page: number; search?: string }

export async function fetchResultTournamentsPage(client: SupabaseClient, { userId, isAdmin, page, search }: PageOptions) {
  const from = (page - 1) * RESULT_TOURNAMENTS_PAGE_SIZE
  let query = client.from('tournaments').select('id, name, organizer_id')
  if (!isAdmin) query = query.eq('organizer_id', userId)
  if (search) query = query.ilike('name', `%${search}%`)
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + RESULT_TOURNAMENTS_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as ResultTournament[]
  return { tournaments: rows.slice(0, RESULT_TOURNAMENTS_PAGE_SIZE), hasNext: rows.length > RESULT_TOURNAMENTS_PAGE_SIZE }
}

type DataOptions = { tournamentId: string; userId: string; isAdmin: boolean; sport: string; season: string }

// Null when the tournament does not exist or belongs to another organizer (admins may
// open any). The API checks the same rule again when a result is submitted.
export async function fetchResultTournamentData(client: SupabaseClient, { tournamentId, userId, isAdmin, sport, season }: DataOptions) {
  const { data: tournament, error: tournamentError } = await client
    .from('tournaments').select('id, name, organizer_id').eq('id', tournamentId).maybeSingle()
  if (tournamentError) throw tournamentError
  if (!tournament || (!isAdmin && (tournament as ResultTournament).organizer_id !== userId)) return null

  // Every team is loaded, not only confirmed ones, so a recorded result can still show
  // its team names if a team changes status afterwards. Only confirmed teams are
  // selectable in the form.
  const [teamsResult, historyResult] = await Promise.all([
    client.from('teams').select('id, name, tournament_id, status').eq('tournament_id', tournamentId).order('name'),
    client.from('match_results')
      .select('id, tournament_id, team_a_id, team_b_id, team_a_score, team_b_score, status, created_at')
      .eq('tournament_id', tournamentId)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(RESULT_HISTORY_LIMIT),
  ])
  if (teamsResult.error) throw teamsResult.error
  if (historyResult.error) throw historyResult.error
  const teams = (teamsResult.data ?? []) as ResultTeam[]
  const confirmedTeams = teams.filter(team => team.status === 'confirmed')

  const members = await inBatches<{ team_id: string; athlete_id: string }>(confirmedTeams.map(team => team.id), batch =>
    client.from('team_members').select('team_id, athlete_id').in('team_id', batch).eq('status', 'accepted'))
  const teamIdByAthlete = new Map(members.map(member => [member.athlete_id, member.team_id]))
  const ranks = await inBatches<Omit<ResultPlayer, 'teamId'>>([...teamIdByAthlete.keys()], batch =>
    client.from('player_ranks').select('id, player_id, player_name, position, pts')
      .eq('sport', sport).eq('season', season).in('player_id', batch))
  const rankedPlayers = ranks
    .map(player => ({ ...player, teamId: player.player_id ? teamIdByAthlete.get(player.player_id) ?? '' : '' }))
    .filter(player => player.teamId)

  // Members with no rank row yet (T32). Only public profiles are offered: a rank row is
  // readable by anyone, and a public profile is the one the athlete (and, for a minor,
  // their guardian) agreed to show. The others are counted so the page can say why.
  const ranked = new Set(ranks.map(player => player.player_id))
  const unranked = [...teamIdByAthlete.keys()].filter(athleteId => !ranked.has(athleteId))
  const profiles = await inBatches<{ user_id: string; display_name: string | null; position: string | null }>(unranked, batch =>
    client.from('athlete_profiles').select('user_id, display_name, position')
      .eq('sport', sport).eq('is_public', true).in('user_id', batch))
  const newPlayers: ResultPlayer[] = profiles.map(profile => ({
    id: newPlayerKey(profile.user_id),
    player_id: profile.user_id,
    player_name: profile.display_name?.trim() || 'Athlete',
    position: profilePosition(profile.position) ?? '',
    pts: FIRST_MATCH_RATING,
    teamId: teamIdByAthlete.get(profile.user_id) ?? '',
    isNew: true,
  }))
  const rosterPlayers = [...rankedPlayers, ...newPlayers]
    .sort((a, b) => a.player_name.localeCompare(b.player_name, 'th'))

  return {
    tournament: tournament as ResultTournament,
    teams,
    confirmedTeams,
    rosterPlayers,
    unrecordableCount: unranked.length - newPlayers.length,
    matchResults: (historyResult.data ?? []) as ResultRow[],
  }
}
