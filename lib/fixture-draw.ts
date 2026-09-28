import type { SupabaseClient } from '@supabase/supabase-js'
import { groupStageFixtures, knockoutFixtures, leagueFixtures, standings, toFixtureRows, type FixtureRow, type Result, type StandingRow } from './fixtures'
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
  // sql/56: the knockout winner, also after a draw decided on penalties.
  winner_team_id?: string | null
}

export type FixtureResult = { id: string; team_a_id: string; team_b_id: string; team_a_score: number; team_b_score: number; status: string }

export type StoredDraw = {
  fixtures: StoredFixture[]
  results: Record<string, FixtureResult>
  teamNames: Record<string, string>
  // Registration order (created_at, id): the last tiebreak, the same one sql/56 uses.
  teamOrder: string[]
  migrationMissing: boolean
  failed: boolean
}

// Linked result ids go to PostgREST in the URL: batches small enough for any request.
export const ID_BATCH = 100
const FIXTURE_COLUMNS = 'fixture_key, stage, round, group_label, home_team_id, away_team_id, home_source, away_source, match_result_id'

// Every fixture of one tournament, read in pages so a 2,016-fixture league is never cut
// at the API's row limit, with its linked results and the tournament's teams.
export async function fetchTournamentFixtures(client: SupabaseClient, tournamentId: string): Promise<StoredDraw> {
  const empty = (missing: boolean): StoredDraw => ({ fixtures: [], results: {}, teamNames: {}, teamOrder: [], migrationMissing: missing, failed: !missing })
  const fixtures: StoredFixture[] = []
  // Before sql/56 the winner column does not exist yet; read without it rather than fail.
  let columns = `${FIXTURE_COLUMNS}, winner_team_id`
  for (let from = 0; ; from += FIXTURE_PAGE) {
    const { data, error } = await client
      .from('tournament_fixtures')
      .select(columns)
      .eq('tournament_id', tournamentId)
      .order('stage', { ascending: true })
      .order('round', { ascending: true })
      .order('fixture_key', { ascending: true })
      .range(from, from + FIXTURE_PAGE - 1)
    if (error?.code === '42703' && columns !== FIXTURE_COLUMNS) { columns = FIXTURE_COLUMNS; from -= FIXTURE_PAGE; continue }
    if (error) return empty(error.code === '42P01' || error.code === 'PGRST205')
    const page = (data ?? []) as unknown as StoredFixture[]
    fixtures.push(...page)
    if (page.length < FIXTURE_PAGE) break
  }

  const linked = fixtures.flatMap(fixture => fixture.match_result_id ? [fixture.match_result_id] : [])
  const batches = Array.from({ length: Math.ceil(linked.length / ID_BATCH) }, (_, index) => linked.slice(index * ID_BATCH, (index + 1) * ID_BATCH))
  const [teamsResult, ...resultPages] = await Promise.all([
    // A drawn tournament has at most 256 teams (MAX_TEAMS); 1,000 covers every entrant.
    client.from('teams').select('id, name').eq('tournament_id', tournamentId)
      .order('created_at', { ascending: true }).order('id', { ascending: true }).limit(1000),
    ...batches.map(batch => client.from('match_results')
      .select('id, team_a_id, team_b_id, team_a_score, team_b_score, status').in('id', batch)),
  ])
  if (teamsResult.error || resultPages.some(page => page.error)) return empty(false)
  const teams = (teamsResult.data ?? []) as { id: string; name: string }[]
  const results = Object.fromEntries(resultPages.flatMap(page => (page.data ?? []) as FixtureResult[]).map(result => [result.id, result]))
  return {
    fixtures, results,
    teamNames: Object.fromEntries(teams.map(row => [row.id, row.name])),
    teamOrder: teams.map(row => row.id),
    migrationMissing: false, failed: false,
  }
}

export type DrawTable = { key: string; group: string | null; rows: StandingRow[] }

// The league table of every group and of a league, from the confirmed results linked to
// its fixtures. Teams start in registration order, so a full tie ranks exactly as
// sql/56 ranks it when it fills the knockout.
export function drawTables(draw: StoredDraw): DrawTable[] {
  const rank = new Map(draw.teamOrder.map((id, index) => [id, index]))
  const tables = new Map<string, { group: string | null; teams: Set<string>; results: Result[] }>()
  for (const fixture of draw.fixtures) {
    if (fixture.stage === 'knockout') continue
    const key = fixture.stage === 'group' ? `group:${fixture.group_label}` : 'league'
    const table = tables.get(key) ?? { group: fixture.stage === 'group' ? fixture.group_label : null, teams: new Set<string>(), results: [] }
    for (const id of [fixture.home_team_id, fixture.away_team_id]) if (id) table.teams.add(id)
    const result = fixture.match_result_id ? draw.results[fixture.match_result_id] : undefined
    if (result && result.status === 'confirmed') table.results.push({ home: result.team_a_id, away: result.team_b_id, homeScore: result.team_a_score, awayScore: result.team_b_score })
    tables.set(key, table)
  }
  return [...tables].sort(([a], [b]) => a.localeCompare(b)).map(([key, table]) => ({
    key,
    group: table.group,
    rows: standings([...table.teams].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity) || a.localeCompare(b)), table.results),
  }))
}

type WinnerResult = { ok: true } | { ok: false; code: ErrorCode; status: number }

// A drawn knockout match waits for the organizer to name the winner (penalties);
// set_fixture_winner_safely (sql/56) checks who may and that the match really was drawn.
export async function saveFixtureWinner(client: SupabaseClient, tournamentId: string, fixtureKey: string, winnerTeamId: string): Promise<WinnerResult> {
  const { error } = await client.rpc('set_fixture_winner_safely', { p_tournament_id: tournamentId, p_fixture_key: fixtureKey, p_winner_team_id: winnerTeamId })
  if (!error) return { ok: true }
  const message = error.message ?? ''
  if (error.code === 'PGRST202' || error.code === '42883' || message.includes('set_fixture_winner_safely')) return { ok: false, code: 'fixtureResultsMigrationMissing', status: 503 }
  if (message.includes('NOT_ALLOWED')) return { ok: false, code: 'fixturesNotAllowed', status: 403 }
  if (message.includes('NOT_A_DRAWN_KNOCKOUT') || message.includes('WINNER_NOT_IN_MATCH')) return { ok: false, code: 'fixtureWinnerInvalid', status: 400 }
  if (message.includes('FIXTURE_ALREADY_ADVANCED')) return { ok: false, code: 'fixtureAlreadyAdvanced', status: 409 }
  return { ok: false, code: 'fixturesFailed', status: 500 }
}

// Publishing a draw shows its team names and scores to everyone (sql/57); only the
// organizer or an admin may switch it, and switching it off hides it again.
export async function saveFixturesPublished(client: SupabaseClient, tournamentId: string, published: boolean): Promise<WinnerResult> {
  const { error } = await client.rpc('set_fixtures_published_safely', { p_tournament_id: tournamentId, p_published: published })
  if (!error) return { ok: true }
  const message = error.message ?? ''
  if (error.code === 'PGRST202' || error.code === '42883' || message.includes('set_fixtures_published_safely')) return { ok: false, code: 'fixturesPublishMigrationMissing', status: 503 }
  if (message.includes('NOT_ALLOWED')) return { ok: false, code: 'fixturesNotAllowed', status: 403 }
  return { ok: false, code: 'fixturesFailed', status: 500 }
}

type PublicFixtureRow = {
  fixture_key: string; stage: StoredFixture['stage']; round: number; group_label: string | null
  home_team_id: string | null; away_team_id: string | null; home_name: string | null; away_name: string | null
  home_source: string | null; away_source: string | null; home_score: number | null; away_score: number | null
  winner_team_id: string | null; home_order: number | null; away_order: number | null
}

// A published draw for anyone, through public_tournament_fixtures (sql/57): an empty
// answer means the draw is private or there is none. The rows are rebuilt into the same
// shape the organizer's page uses, so both rank tables identically.
export async function fetchPublicDraw(client: SupabaseClient, tournamentId: string): Promise<{ draw: StoredDraw | null; migrationMissing: boolean; failed: boolean }> {
  const { data, error } = await client.rpc('public_tournament_fixtures', { p_tournament_id: tournamentId })
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883' || (error.message ?? '').includes('public_tournament_fixtures')
    return { draw: null, migrationMissing: missing, failed: !missing }
  }
  const rows = (data ?? []) as PublicFixtureRow[]
  if (rows.length === 0) return { draw: null, migrationMissing: false, failed: false }
  const teamNames: Record<string, string> = {}
  const order = new Map<string, number>()
  const results: Record<string, FixtureResult> = {}
  const fixtures: StoredFixture[] = rows.map(row => {
    for (const [id, name, position] of [[row.home_team_id, row.home_name, row.home_order], [row.away_team_id, row.away_name, row.away_order]] as const) {
      if (!id) continue
      teamNames[id] = name ?? '—'
      if (position !== null) order.set(id, position)
    }
    const played = row.home_score !== null && row.away_score !== null && row.home_team_id && row.away_team_id
    if (played) results[row.fixture_key] = { id: row.fixture_key, team_a_id: row.home_team_id!, team_b_id: row.away_team_id!, team_a_score: row.home_score!, team_b_score: row.away_score!, status: 'confirmed' }
    return {
      fixture_key: row.fixture_key, stage: row.stage, round: row.round, group_label: row.group_label,
      home_team_id: row.home_team_id, away_team_id: row.away_team_id, home_source: row.home_source, away_source: row.away_source,
      match_result_id: played ? row.fixture_key : null, winner_team_id: row.winner_team_id,
    }
  })
  const teamOrder = [...order].sort((a, b) => a[1] - b[1]).map(([id]) => id)
  return { draw: { fixtures, results, teamNames, teamOrder, migrationMissing: false, failed: false }, migrationMissing: false, failed: false }
}
