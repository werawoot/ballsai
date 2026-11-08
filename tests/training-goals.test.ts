import { describe, expect, it } from 'vitest'
import { TRAINING_GOALS, goalFits, isTrainingGoal, orderForGoal } from '@/lib/training/goals'
import { programsForBand } from '@/lib/training/content'

// The training goal (ADR-015, owner 8 Nov 2026): one of four fixed choices, picked before a
// programme, each tied to the programmes that serve it.

describe('training goals', () => {
  it('offers the four goals the owner chose', () => {
    expect(TRAINING_GOALS).toEqual(['ball_control', 'strength', 'speed', 'consistency'])
    expect(isTrainingGoal('speed')).toBe(true)
    expect(isTrainingGoal('weights')).toBe(false)
    expect(isTrainingGoal(null)).toBe(false)
  })

  it('ties each goal to the programmes that serve it, in both age bands', () => {
    expect(goalFits('u10-ball-mastery-01', 'ball_control')).toBe(true)
    expect(goalFits('u14-game-skills-01', 'speed')).toBe(true)
    expect(goalFits('u10-foundation-01', 'strength')).toBe(true)
    expect(goalFits('u14-prevention-01', 'strength')).toBe(true)
    expect(goalFits('u14-prevention-01', 'ball_control')).toBe(false)
    for (const band of ['u10_u13', 'u14_u17'] as const) for (const goal of TRAINING_GOALS) {
      expect(programsForBand(band).some(program => program.access === 'solo' && goalFits(program.id, goal)), `${band} ${goal}`).toBe(true)
    }
  })

  it('treats every programme as fitting "train regularly"', () => {
    for (const program of programsForBand('u14_u17')) expect(goalFits(program.id, 'consistency')).toBe(true)
  })

  it('lists the programmes that fit the goal first, keeping the order otherwise', () => {
    const ids = orderForGoal(programsForBand('u14_u17'), 'strength').map(program => program.id)
    expect(ids[0]).toBe('u14-prevention-01')
    expect(orderForGoal(programsForBand('u14_u17'), null).map(program => program.id)).toEqual(programsForBand('u14_u17').map(program => program.id))
  })
})
