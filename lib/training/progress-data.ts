import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from './data'
import type { HistoryCheckin, HistoryEnrollment } from './progress'

// The athlete's whole training history for /progress (ADR-015): every programme they ever
// started and every check-in, their own rows only (RLS, sql/63). Both lists are read a page of
// 1,000 at a time, ordered by a unique key last, so a long history is never cut off at the API
// limit and no row is skipped or repeated between pages. If any page fails, `complete` is false
// and the page says so instead of showing totals that are short.

const PAGE = 1000

export type TrainingHistory = { available: boolean; complete: boolean; enrollments: HistoryEnrollment[]; checkins: HistoryCheckin[] }

type Page<Row> = { data: Row[] | null; error: { code?: string } | null }

async function readAll<Row>(page: (from: number, to: number) => PromiseLike<Page<Row>>): Promise<{ rows: Row[]; error: { code?: string } | null }> {
  const rows: Row[] = []
  for (let start = 0; ; start += PAGE) {
    const { data, error } = await page(start, start + PAGE - 1)
    if (error) return { rows, error }
    const got = data ?? []
    rows.push(...got)
    if (got.length < PAGE) return { rows, error: null }
  }
}

export async function fetchTrainingHistory(client: SupabaseClient, userId: string): Promise<TrainingHistory> {
  const enrollments = await readAll<HistoryEnrollment>((from, to) => client.from('training_enrollments')
    .select('id, program_id, weekdays, start_date, status')
    .eq('athlete_id', userId)
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to) as unknown as PromiseLike<Page<HistoryEnrollment>>)
  if (enrollments.error) {
    if (!isMissingTable(enrollments.error)) console.error(JSON.stringify({ level: 'error', event: 'training_history_failed', code: enrollments.error.code ?? null }))
    return { available: !isMissingTable(enrollments.error), complete: isMissingTable(enrollments.error), enrollments: [], checkins: [] }
  }
  if (enrollments.rows.length === 0) return { available: true, complete: true, enrollments: [], checkins: [] }
  const checkins = await readAll<HistoryCheckin>((from, to) => client.from('training_checkins')
    .select('enrollment_id, session_date')
    .eq('athlete_id', userId)
    .order('session_date', { ascending: true })
    .order('id')
    .range(from, to) as unknown as PromiseLike<Page<HistoryCheckin>>)
  if (checkins.error) console.error(JSON.stringify({ level: 'error', event: 'training_history_failed', code: checkins.error.code ?? null }))
  return { available: true, complete: !checkins.error, enrollments: enrollments.rows, checkins: checkins.rows }
}

/** Every session the athlete ever checked in: a head count, no row is read (the home's level). */
export async function countTrainingCheckins(client: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await client.from('training_checkins').select('enrollment_id', { count: 'exact', head: true }).eq('athlete_id', userId)
  if (error) {
    if (!isMissingTable(error)) console.error(JSON.stringify({ level: 'error', event: 'training_count_failed', code: error.code ?? null }))
    return 0
  }
  return count ?? 0
}
