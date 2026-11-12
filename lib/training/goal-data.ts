import type { SupabaseClient } from '@supabase/supabase-js'
import { isMissingTable } from './data'
import { isTrainingGoal, type TrainingGoal } from './goals'

// The athlete's current training goal (SQL95), their own row only (RLS). `available` is false
// before SQL95 is applied, or when the person has no athlete profile (a guardian or a coach):
// the app then skips the goal step, which only an athlete can save.

export type MyGoal = { available: boolean; goal: TrainingGoal | null }

export async function fetchMyGoal(client: SupabaseClient, userId: string): Promise<MyGoal> {
  const [goalRead, athleteRead] = await Promise.all([
    client.from('athlete_training_goals').select('goal_key').eq('athlete_id', userId).is('ended_at', null).maybeSingle(),
    client.from('athlete_profiles').select('user_id').eq('user_id', userId).maybeSingle(),
  ])
  if (goalRead.error) {
    if (!isMissingTable(goalRead.error)) console.error(JSON.stringify({ level: 'error', event: 'training_goal_failed', code: goalRead.error.code ?? null }))
    return { available: false, goal: null }
  }
  if (!athleteRead.data) return { available: false, goal: null }
  const key = (goalRead.data as { goal_key?: string } | null)?.goal_key
  return { available: true, goal: isTrainingGoal(key) ? key : null }
}

// The current goal of an athlete the viewer may read (an accepted guardian, through SQL95's RLS).
// `available` is false before SQL95 is applied or when the read fails.
export async function fetchGoalOf(client: SupabaseClient, athleteId: string): Promise<{ available: boolean; goal: TrainingGoal | null }> {
  const { data, error } = await client.from('athlete_training_goals').select('goal_key').eq('athlete_id', athleteId).is('ended_at', null).maybeSingle()
  if (error) {
    if (!isMissingTable(error)) console.error(JSON.stringify({ level: 'error', event: 'training_goal_failed', code: error.code ?? null }))
    return { available: false, goal: null }
  }
  const key = (data as { goal_key?: string } | null)?.goal_key
  return { available: true, goal: isTrainingGoal(key) ? key : null }
}
