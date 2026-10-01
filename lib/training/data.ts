import type { SupabaseClient } from '@supabase/supabase-js'

// The signed-in athlete's training rows (sql/63). Every read is the athlete's own (RLS),
// one indexed query per table. Before SQL63 is applied the tables do not exist: the pages
// then say training is not switched on, instead of failing.

export type Enrollment = { id: string; program_id: string; weekdays: number[]; start_date: string; status: string }
export type MyTraining = { available: boolean; enrollments: Enrollment[]; checkins: Record<string, string[]> }

// PostgREST answers PGRST205 for a table it does not know; Postgres itself 42P01.
export const isMissingTable = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01'

export async function fetchMyTraining(client: SupabaseClient, userId: string): Promise<MyTraining> {
  const { data, error } = await client.from('training_enrollments')
    .select('id, program_id, weekdays, start_date, status')
    .eq('athlete_id', userId).eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) {
    if (!isMissingTable(error)) console.error(JSON.stringify({ level: 'error', event: 'training_enrollments_failed', code: error.code ?? null }))
    return { available: !isMissingTable(error), enrollments: [], checkins: {} }
  }
  const enrollments = (data ?? []) as Enrollment[]
  if (enrollments.length === 0) return { available: true, enrollments, checkins: {} }
  const since = enrollments.map(item => item.start_date).sort()[0]
  const result = await client.from('training_checkins')
    .select('enrollment_id, session_date')
    .eq('athlete_id', userId).gte('session_date', since)
  const checkins: Record<string, string[]> = {}
  for (const row of (result.data ?? []) as { enrollment_id: string; session_date: string }[]) (checkins[row.enrollment_id] ??= []).push(row.session_date)
  return { available: true, enrollments, checkins }
}
