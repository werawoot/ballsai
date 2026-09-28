import type { SupabaseClient } from '@supabase/supabase-js'
import { groupStageFixtures, knockoutFixtures, leagueFixtures, toFixtureRows, type FixtureRow } from './fixtures'
import type th from '@/messages/th.json'

// Turns an organizer's choice (format, groups, seeding) into a stored draw. The server
// builds the fixtures from the tournament's confirmed teams -- it never stores fixtures a
// browser sent -- and save_tournament_fixtures_safely (sql/55) checks everything again.

export type DrawFormat = 'knockout' | 'league' | 'groups'
export type DrawRequest = { format: DrawFormat; order: 'random' | 'registration'; groupCount?: number; advancePerGroup?: number }
type ErrorCode = keyof typeof th.apiErrors

// A 64-team league is 2,016 fixtures, the most sql/55 accepts; a knockout of 256 is 255.
export const MAX_TEAMS: Record<DrawFormat, number> = { knockout: 256, league: 64, groups: 256 }
const FIXTURE_PAGE = 1000

export function parseDrawRequest(body: unknown): DrawRequest | { error: 'fixturesRequestInvalid' } {
  const invalid = { error: 'fixturesRequestInvalid' as const }
  if (!body || typeof body !== 'object') return invalid
  const input = body as Record<string, unknown>
  if (input.format !== 'knockout' && input.format !== 'league' && input.format !== 'groups') return invalid
  const order = input.order ?? 'registration'
  if (order !== 'random' && order !== 'registration') return invalid
  if (input.format !== 'groups') return { format: input.format, order }
  const groupCount = Number(input.groupCount)
  const advancePerGroup = Number(input.advancePerGroup ?? 2)
  if (!Number.isInteger(groupCount) || groupCount < 2 || groupCount > 16) return invalid
  if (advancePerGroup !== 1 && advancePerGroup !== 2) return invalid
  return { format: 'groups', order, groupCount, advancePerGroup }
}

// Fisher-Yates with an unbiased source: crypto in production, a fixed sequence in tests.
const cryptoRandom = () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32
function shuffle<T>(items: T[], random: () => number) {
  const copy = [...items]
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1))
    ;[copy[index], copy[other]] = [copy[other], copy[index]]
  }
  return copy
}

function buildRows(teamIds: string[], request: DrawRequest): FixtureRow[] {
  if (request.format === 'knockout') return toFixtureRows(knockoutFixtures(teamIds.map(teamId => ({ kind: 'team', teamId }))))
  if (request.format === 'league') return toFixtureRows(leagueFixtures(teamIds))
  return toFixtureRows(groupStageFixtures(teamIds, { groupCount: request.groupCount!, advancePerGroup: request.advancePerGroup! }).fixtures)
}

type SaveResult = { ok: true; count: number } | { ok: false; code: ErrorCode; status: number }

export async function saveTournamentDraw(client: SupabaseClient, tournamentId: string, request: DrawRequest, random = cryptoRandom): Promise<SaveResult> {
  const limit = MAX_TEAMS[request.format]
  // Registration order; RLS already limits teams to this organizer's tournaments.
  const { data, error } = await client
    .from('teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit + 1)
  if (error) return { ok: false, code: 'fixturesFailed', status: 500 }
  const ids = ((data ?? []) as { id: string }[]).map(row => row.id)
  if (ids.length < 2) return { ok: false, code: 'fixturesNeedTwoTeams', status: 400 }
  if (ids.length > limit) return { ok: false, code: 'fixturesTooManyTeams', status: 400 }

  let rows: FixtureRow[]
  try {
    rows = buildRows(request.order === 'random' ? shuffle(ids, random) : ids, request)
  } catch (problem) {
    const message = problem instanceof Error ? problem.message : ''
    if (message === 'GROUP_TOO_SMALL') return { ok: false, code: 'fixturesGroupsTooSmall', status: 400 }
    return { ok: false, code: 'fixturesRequestInvalid', status: 400 }
  }

  const saved = await client.rpc('save_tournament_fixtures_safely', { p_tournament_id: tournamentId, p_fixtures: rows })
  if (!saved.error) return { ok: true, count: Number(saved.data) }
  const message = saved.error.message ?? ''
  if (saved.error.code === 'PGRST202' || saved.error.code === '42883' || message.includes('save_tournament_fixtures_safely')) return { ok: false, code: 'fixturesMigrationMissing', status: 503 }
  if (message.includes('NOT_ALLOWED')) return { ok: false, code: 'fixturesNotAllowed', status: 403 }
  if (message.includes('FIXTURES_HAVE_RESULTS')) return { ok: false, code: 'fixturesHaveResults', status: 409 }
  // A team was withdrawn or rejected between reading the teams and saving: draw again.
  if (message.includes('TEAM_NOT_CONFIRMED')) return { ok: false, code: 'fixturesTeamsChanged', status: 409 }
  return { ok: false, code: 'fixturesFailed', status: 500 }
}

export type StoredFixture = {
  fixture_key: string
  stage: 'knockout' | 'league' | 'group'
  round: number
  group_label: string | null
  home_team_id: string | null
  away_team_id: string | null
  home_source: string | null
  away_source: string | null
  match_result_id: string | null
}

// Every fixture of one tournament, read in pages so a 2,016-fixture league is never cut
// at the API's row limit, with the names of the tournament's teams.
export async function fetchTournamentFixtures(client: SupabaseClient, tournamentId: string) {
  const fixtures: StoredFixture[] = []
  for (let from = 0; ; from += FIXTURE_PAGE) {
    const { data, error } = await client
      .from('tournament_fixtures')
      .select('fixture_key, stage, round, group_label, home_team_id, away_team_id, home_source, away_source, match_result_id')
      .eq('tournament_id', tournamentId)
      .order('stage', { ascending: true })
      .order('round', { ascending: true })
      .order('fixture_key', { ascending: true })
      .range(from, from + FIXTURE_PAGE - 1)
    if (error) {
      const missing = error.code === '42P01' || error.code === 'PGRST205'
      return { fixtures: [] as StoredFixture[], teamNames: {} as Record<string, string>, migrationMissing: missing, failed: !missing }
    }
    const page = (data ?? []) as StoredFixture[]
    fixtures.push(...page)
    if (page.length < FIXTURE_PAGE) break
  }
  const { data: teams } = await client.from('teams').select('id, name').eq('tournament_id', tournamentId).limit(1000)
  const teamNames = Object.fromEntries(((teams ?? []) as { id: string; name: string }[]).map(row => [row.id, row.name]))
  return { fixtures, teamNames, migrationMissing: false, failed: false }
}
