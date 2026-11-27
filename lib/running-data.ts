import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunGoal, RunWeek } from './running'

// Running mode V1 (sql/108): the signed-in account's runs, a page at a time, its weekly totals
// from the database (my_run_weeks) and its goal. Before sql/108 `available` is false.
export const RUN_PAGE_SIZE = 20
export const RUN_WEEKS = 12
export type RunRow = { id: string; run_date: string; distance_m: number; duration_s: number }
export type MyRunning = { available: boolean; runs: RunRow[]; hasNext: boolean; weeks: RunWeek[]; goal: RunGoal | null }

const MISSING = ['PGRST202', 'PGRST205', '42883', '42P01']

export async function fetchMyRunning(client: SupabaseClient, userId: string, page: number): Promise<MyRunning> {
  const from = (Math.max(1, page) - 1) * RUN_PAGE_SIZE
  const [runs, weeks, goal] = await Promise.all([
    client.from('run_logs').select('id, run_date, distance_m, duration_s').eq('user_id', userId)
      .order('run_date', { ascending: false }).order('created_at', { ascending: false }).order('id', { ascending: true })
      .range(from, from + RUN_PAGE_SIZE),
    client.rpc('my_run_weeks', { p_weeks: RUN_WEEKS }),
    client.from('run_goals').select('unit, target').eq('user_id', userId).maybeSingle(),
  ])
  const failure = runs.error ?? weeks.error ?? goal.error
  if (failure) {
    if (MISSING.includes(failure.code ?? '')) return { available: false, runs: [], hasNext: false, weeks: [], goal: null }
    throw failure
  }
  const rows = (runs.data ?? []) as RunRow[]
  return {
    available: true,
    runs: rows.slice(0, RUN_PAGE_SIZE),
    hasNext: rows.length > RUN_PAGE_SIZE,
    weeks: ((weeks.data ?? []) as { week_start: string; runs: number; distance_m: number; duration_s: number }[])
      .map(row => ({ weekStart: row.week_start, runs: Number(row.runs), distanceM: Number(row.distance_m), durationS: Number(row.duration_s) })),
    goal: (goal.data as RunGoal | null) ?? null,
  }
}
