import { describe, expect, it } from 'vitest'
import { POINTS_PER_LEVEL, SESSIONS_PER_LEVEL, trainingLevel } from '@/lib/training/level'
import { EFFORT_PER_SESSION } from '@/lib/athlete-home'

// The training level (ADR-015, owner 8 Nov 2026: "Level จากแต้มขยัน"). It rises with effort
// points only, ten recorded sessions a level, and is kept apart from XP and Power Rating,
// which come from confirmed matches.

describe('the training level', () => {
  it('needs ten sessions of effort points a level', () => {
    expect(SESSIONS_PER_LEVEL).toBe(10)
    expect(POINTS_PER_LEVEL).toBe(SESSIONS_PER_LEVEL * EFFORT_PER_SESSION)
  })

  it('starts at level 1 and says how far the next level is', () => {
    expect(trainingLevel(0)).toEqual({ level: 1, points: 0, floor: 0, target: 500, percent: 0, sessionsToNext: 10 })
    expect(trainingLevel(50)).toEqual({ level: 1, points: 50, floor: 0, target: 500, percent: 10, sessionsToNext: 9 })
  })

  it('moves up exactly at the threshold', () => {
    expect(trainingLevel(499).level).toBe(1)
    expect(trainingLevel(500)).toEqual({ level: 2, points: 500, floor: 500, target: 1000, percent: 0, sessionsToNext: 10 })
    expect(trainingLevel(1250)).toMatchObject({ level: 3, floor: 1000, target: 1500, percent: 50, sessionsToNext: 5 })
  })

  it('treats a missing or negative total as none', () => {
    expect(trainingLevel(-50).level).toBe(1)
    expect(trainingLevel(Number.NaN).points).toBe(0)
  })
})
