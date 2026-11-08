import { EFFORT_PER_SESSION } from '@/lib/athlete-home'

// The training level (ADR-015, owner 8 Nov 2026: "Level จากแต้มขยัน"). It rises with effort
// points only, never with XP, and never feeds Power Rating, the card or the ranking, which come
// from confirmed matches. One constant sets the pace: ten recorded sessions a level.

export const SESSIONS_PER_LEVEL = 10
export const POINTS_PER_LEVEL = SESSIONS_PER_LEVEL * EFFORT_PER_SESSION

export type TrainingLevel = { level: number; points: number; floor: number; target: number; percent: number; sessionsToNext: number }

export function trainingLevel(effortPoints: number): TrainingLevel {
  const points = Number.isFinite(effortPoints) && effortPoints > 0 ? Math.floor(effortPoints) : 0
  const reached = Math.floor(points / POINTS_PER_LEVEL)
  const floor = reached * POINTS_PER_LEVEL
  const target = floor + POINTS_PER_LEVEL
  return {
    level: reached + 1,
    points,
    floor,
    target,
    percent: Math.round((points - floor) / POINTS_PER_LEVEL * 100),
    sessionsToNext: Math.ceil((target - points) / EFFORT_PER_SESSION),
  }
}
