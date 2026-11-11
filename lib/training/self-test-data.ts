import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchMyAthletePrivate } from '@/lib/athlete-private'
import { isMissingTable } from './data'
import { isSelfTestKey, SELF_TEST_KEYS, type SelfTestResult } from './self-tests'

// The athlete's own self-test results (SQL96), RLS-limited to their rows. Only the latest two
// per test are read: the page shows the last result against the one before it, so the read is
// three indexed lookups of two rows whatever the history length. `status` is 'notReady' before
// SQL96 is applied or when a read fails, and 'notAthlete' for someone with no athlete profile. The birth
// date (for the long-jump age rule) comes only through my_athlete_private (sql/58, T50).

export type MySelfTests = { status: 'ready' | 'notReady' | 'notAthlete'; birthDate: string | null; rows: SelfTestResult[] }

export async function fetchMySelfTests(client: SupabaseClient, userId: string): Promise<MySelfTests> {
  const [athleteRead, ...testReads] = await Promise.all([
    client.from('athlete_profiles').select('user_id').eq('user_id', userId).maybeSingle(),
    ...SELF_TEST_KEYS.map(key => client.from('athlete_self_tests').select('test_key, value, test_date')
      .eq('athlete_id', userId).eq('test_key', key).order('test_date', { ascending: false }).limit(2)),
  ])
  for (const read of testReads) {
    if (read.error) {
      if (!isMissingTable(read.error)) console.error(JSON.stringify({ level: 'error', event: 'self_tests_failed', code: read.error.code ?? null }))
      return { status: 'notReady', birthDate: null, rows: [] }
    }
  }
  if (athleteRead.error) return { status: 'notReady', birthDate: null, rows: [] }
  if (!athleteRead.data) return { status: 'notAthlete', birthDate: null, rows: [] }
  let birthDate: string | null = null
  try {
    birthDate = (await fetchMyAthletePrivate(client)).birth_date
  } catch (error) {
    // Without a birth date the long jump stays closed; the other two tests still work.
    console.error(JSON.stringify({ level: 'error', event: 'self_tests_birth_date_failed', code: (error as { code?: string }).code ?? null }))
  }
  const rows: SelfTestResult[] = []
  for (const read of testReads) {
    for (const row of (read.data ?? []) as { test_key: unknown; value: unknown; test_date: unknown }[]) {
      if (isSelfTestKey(row.test_key) && typeof row.value === 'number' && typeof row.test_date === 'string') rows.push({ test_key: row.test_key, value: row.value, test_date: row.test_date })
    }
  }
  return { status: 'ready', birthDate, rows }
}
