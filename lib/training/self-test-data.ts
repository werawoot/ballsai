import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchMyAthletePrivate } from '@/lib/athlete-private'
import { isMissingTable } from './data'
import { isSelfTestKey, SELF_TEST_KEYS, type SelfTestKey, type SelfTestResult } from './self-tests'

// The athlete's own self-test results (SQL96), RLS-limited to their rows. Only the latest two
// per test are read: the page shows the last result against the one before it, so the read is
// three indexed lookups of two rows whatever the history length. `status` is 'notReady' before
// SQL96 is applied or when a read fails, and 'notAthlete' for someone with no athlete profile. The birth
// date (for the long-jump age rule) comes only through my_athlete_private (sql/58, T50).

export type MySelfTests = { status: 'ready' | 'notReady' | 'notAthlete'; birthDate: string | null; rows: SelfTestResult[] }

// Rows as the API returns them, keeping only well-formed ones.
function parseRows(data: unknown): SelfTestResult[] {
  const rows: SelfTestResult[] = []
  for (const row of (Array.isArray(data) ? data : []) as { test_key: unknown; value: unknown; test_date: unknown }[]) {
    if (isSelfTestKey(row.test_key) && typeof row.value === 'number' && typeof row.test_date === 'string') rows.push({ test_key: row.test_key, value: row.value, test_date: row.test_date })
  }
  return rows
}

// One athlete's latest two results per test (SQL96), for the athlete themselves or an accepted
// guardian (RLS decides who may read). 'notReady' before SQL96 is applied or when a read fails.
export async function fetchSelfTestResults(client: SupabaseClient, athleteId: string): Promise<{ ready: boolean; rows: SelfTestResult[] }> {
  const reads = await Promise.all(SELF_TEST_KEYS.map(key => client.from('athlete_self_tests').select('test_key, value, test_date')
    .eq('athlete_id', athleteId).eq('test_key', key).order('test_date', { ascending: false }).limit(2)))
  const rows: SelfTestResult[] = []
  for (const read of reads) {
    if (read.error) {
      if (!isMissingTable(read.error)) console.error(JSON.stringify({ level: 'error', event: 'self_tests_failed', code: read.error.code ?? null }))
      return { ready: false, rows: [] }
    }
    rows.push(...parseRows(read.data))
  }
  return { ready: true, rows }
}

export async function fetchMySelfTests(client: SupabaseClient, userId: string): Promise<MySelfTests> {
  const [athleteRead, results] = await Promise.all([
    client.from('athlete_profiles').select('user_id').eq('user_id', userId).maybeSingle(),
    fetchSelfTestResults(client, userId),
  ])
  if (!results.ready || athleteRead.error) return { status: 'notReady', birthDate: null, rows: [] }
  if (!athleteRead.data) return { status: 'notAthlete', birthDate: null, rows: [] }
  let birthDate: string | null = null
  try {
    birthDate = (await fetchMyAthletePrivate(client)).birth_date
  } catch (error) {
    // Without a birth date the long jump stays closed; the other two tests still work.
    console.error(JSON.stringify({ level: 'error', event: 'self_tests_birth_date_failed', code: (error as { code?: string }).code ?? null }))
  }
  return { status: 'ready', birthDate, rows: results.rows }
}

// One test's results, newest first, a page at a time (the history page). `before` is the date
// of the last row already shown; one extra row is read only to know whether an older page exists,
// so a long history is never cut off silently.
export const SELF_TEST_HISTORY_PAGE = 20

export async function fetchSelfTestHistory(client: SupabaseClient, athleteId: string, key: SelfTestKey, before: string | null): Promise<{ ready: boolean; rows: SelfTestResult[]; hasMore: boolean }> {
  let query = client.from('athlete_self_tests').select('test_key, value, test_date').eq('athlete_id', athleteId).eq('test_key', key)
  if (before) query = query.lt('test_date', before)
  const { data, error } = await query.order('test_date', { ascending: false }).limit(SELF_TEST_HISTORY_PAGE + 1)
  if (error) {
    if (!isMissingTable(error)) console.error(JSON.stringify({ level: 'error', event: 'self_test_history_failed', code: error.code ?? null }))
    return { ready: false, rows: [], hasMore: false }
  }
  const rows = parseRows(data)
  return { ready: true, rows: rows.slice(0, SELF_TEST_HISTORY_PAGE), hasMore: rows.length > SELF_TEST_HISTORY_PAGE }
}
