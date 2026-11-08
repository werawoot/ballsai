import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from './data'
import { isTrainingGoal, type TrainingGoal } from './goals'

// The athlete's current training goal (SQL95), their own row only (RLS). Before SQL95 is
// applied the table does not exist: `available` is false and the app skips the goal step.

export type MyGoal = { available: boolean; goal: TrainingGoal | null }

export async function fetchMyGoal(client: SupabaseClient, userId: string): Promise<MyGoal> {
  const { data, error } = await client.from('athlete_training_goals')
    .select('goal_key')
    .eq('athlete_id', userId)
    .is('ended_at', null)
    .maybeSingle()
  if (error) {
    if (!isMissingTable(error)) console.error(JSON.stringify({ level: 'error', event: 'training_goal_failed', code: error.code ?? null }))
    return { available: !isMissingTable(error), goal: null }
  }
  const key = (data as { goal_key?: string } | null)?.goal_key
  return { available: true, goal: isTrainingGoal(key) ? key : null }
}
