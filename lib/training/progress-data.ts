import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from './data'
import type { HistoryCheckin, HistoryEnrollment } from './progress'

// The athlete's whole training history for /progress (ADR-015): every programme they ever
// started and every check-in, their own rows only (RLS, sql/63). Check-ins are read a page of
// 1,000 at a time until the last page, so a long history is never cut off at the API limit.

const PAGE = 1000

export type TrainingHistory = { available: boolean; enrollments: HistoryEnrollment[]; checkins: HistoryCheckin[] }

export async function fetchTrainingHistory(client: SupabaseClient, userId: string): Promise<TrainingHistory> {
  const { data, error } = await client.from('training_enrollments')
    .select('id, program_id, weekdays, start_date, status')
    .eq('athlete_id', userId)
    .order('created_at', { ascending: false })
  if (error) {
    if (!isMissingTable(error)) console.error(JSON.stringify({ level: 'error', event: 'training_history_failed', code: error.code ?? null }))
    return { available: !isMissingTable(error), enrollments: [], checkins: [] }
  }
  const enrollments = (data ?? []) as HistoryEnrollment[]
  if (enrollments.length === 0) return { available: true, enrollments, checkins: [] }
  const checkins: HistoryCheckin[] = []
  for (let start = 0; ; start += PAGE) {
    const page = await client.from('training_checkins')
      .select('enrollment_id, session_date')
      .eq('athlete_id', userId)
      .order('session_date', { ascending: true })
      .range(start, start + PAGE - 1)
    if (page.error) {
      console.error(JSON.stringify({ level: 'error', event: 'training_history_failed', code: page.error.code ?? null }))
      break
    }
    const rows = (page.data ?? []) as HistoryCheckin[]
    checkins.push(...rows)
    if (rows.length < PAGE) break
  }
  return { available: true, enrollments, checkins }
}
