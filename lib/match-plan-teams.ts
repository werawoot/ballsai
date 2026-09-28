import type { SupabaseClient } from '@supabase/supabase-js'

// /match-plan lets a coach plan a line-up for a team they may manage: one they created,
// or one entered in a tournament they organize (the same rule get_match_plan_safely
// enforces). The query filters by the user itself, one scope at a time, instead of
// relying on RLS -- which would hand an admin every team in the country.
export const MATCH_PLAN_TEAMS_PAGE_SIZE = 10

export type MatchPlanScope = 'mine' | 'organized'
export type MatchPlanTeamRow = { id: string; name: string; status: string; tournament_id: string; tournaments: { name: string; start_date: string | null } | null }

type Options = { userId: string; scope: MatchPlanScope; page: number; search?: string }

export async function fetchMatchPlanTeamsPage(client: SupabaseClient, { userId, scope, page, search }: Options) {
  const from = (page - 1) * MATCH_PLAN_TEAMS_PAGE_SIZE
  let query = scope === 'organized'
    ? client.from('teams').select('id, name, status, tournament_id, tournaments!inner(name, start_date, organizer_id)').eq('tournaments.organizer_id', userId)
    : client.from('teams').select('id, name, status, tournament_id, tournaments(name, start_date)').eq('created_by', userId)
  if (search) query = query.ilike('name', `%${search}%`)
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })
    .range(from, from + MATCH_PLAN_TEAMS_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as unknown as MatchPlanTeamRow[]
  return { teams: rows.slice(0, MATCH_PLAN_TEAMS_PAGE_SIZE), hasNext: rows.length > MATCH_PLAN_TEAMS_PAGE_SIZE }
}
