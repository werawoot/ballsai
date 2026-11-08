import type { Program } from './content'

// The training goal (ADR-015, owner 8 Nov 2026): one of four fixed choices, picked before a
// programme. The same four are the only values SQL95 accepts. Each goal names the programmes
// that serve it; "train regularly" fits every programme.

export const TRAINING_GOALS = ['ball_control', 'strength', 'speed', 'consistency'] as const
export type TrainingGoal = (typeof TRAINING_GOALS)[number]

export const isTrainingGoal = (value: unknown): value is TrainingGoal => typeof value === 'string' && (TRAINING_GOALS as readonly string[]).includes(value)

const GOAL_PROGRAMS: Record<Exclude<TrainingGoal, 'consistency'>, readonly string[]> = {
  ball_control: ['u10-ball-mastery-01', 'u14-game-skills-01'],
  strength: ['u10-foundation-01', 'u14-prevention-01'],
  speed: ['u10-ball-mastery-01', 'u14-game-skills-01'],
}

export function goalFits(programId: string, goal: TrainingGoal): boolean {
  return goal === 'consistency' || GOAL_PROGRAMS[goal].includes(programId)
}

/** The programmes that fit the goal first; otherwise the order stays as it was. */
export function orderForGoal<P extends Pick<Program, 'id'>>(programs: P[], goal: TrainingGoal | null): P[] {
  if (!goal || goal === 'consistency') return programs
  return [...programs.filter(program => goalFits(program.id, goal)), ...programs.filter(program => !goalFits(program.id, goal))]
}
