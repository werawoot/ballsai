export type MatchResult = 'win' | 'draw' | 'loss'
export type PlayerPosition = 'FW' | 'MF' | 'DF' | 'GK'

export type RatingInput = {
  currentRating: number
  opponentRating: number
  result: MatchResult
  position: PlayerPosition
  matchesPlayed: number
  goals?: number
  assists?: number
  cleanSheet?: boolean
  mvp?: boolean
  savePercentage?: number
}

export type RatingBreakdown = {
  nextRating: number
  ratingChange: number
  matchChange: number
  performanceBonus: number
  confidence: 'provisional' | 'active' | 'full'
}

const MIN_RATING = 0
const MAX_RATING = 3000
const STARTING_RATING = 1000
const K_FACTOR = 32

function clampRating(rating: number) {
  return Math.min(MAX_RATING, Math.max(MIN_RATING, Math.round(rating)))
}

function scoreForResult(result: MatchResult) {
  if (result === 'win') return 1
  if (result === 'draw') return 0.5
  return 0
}

function expectedScore(playerRating: number, opponentRating: number) {
  return 1 / (1 + 10 ** ((opponentRating - playerRating) / 400))
}

export function getRatingConfidence(matchesPlayed: number): RatingBreakdown['confidence'] {
  if (matchesPlayed < 3) return 'provisional'
  if (matchesPlayed < 10) return 'active'
  return 'full'
}

export function calculateMatchChange(currentRating: number, opponentRating: number, result: MatchResult) {
  const actual = scoreForResult(result)
  const expected = expectedScore(currentRating, opponentRating)
  return Math.round(K_FACTOR * (actual - expected))
}

export function calculatePerformanceBonus(input: RatingInput) {
  const goals = input.goals ?? 0
  const assists = input.assists ?? 0
  const savePercentage = input.savePercentage ?? 0
  let bonus = 0

  if (input.position === 'FW') {
    bonus += goals * 5 + assists * 3
  } else if (input.position === 'MF') {
    bonus += goals * 4 + assists * 4
  } else if (input.position === 'DF') {
    bonus += goals * 4 + assists * 3
    if (input.cleanSheet) bonus += 5
  } else if (input.position === 'GK') {
    if (input.cleanSheet) bonus += 5
    if (savePercentage >= 80) bonus += 5
    else if (savePercentage >= 70) bonus += 3
  }

  if (input.mvp) bonus += 5

  return Math.min(15, bonus)
}

export function calculateRating(input: RatingInput): RatingBreakdown {
  const currentRating = input.currentRating || STARTING_RATING
  const opponentRating = input.opponentRating || STARTING_RATING
  const matchChange = calculateMatchChange(currentRating, opponentRating, input.result)
  const performanceBonus = calculatePerformanceBonus(input)
  const ratingChange = matchChange + performanceBonus

  return {
    nextRating: clampRating(currentRating + ratingChange),
    ratingChange,
    matchChange,
    performanceBonus,
    confidence: getRatingConfidence(input.matchesPlayed + 1),
  }
}

export function ratingToOverall(rating: number) {
  return Math.min(99, Math.max(40, Math.round(40 + (clampRating(rating) / MAX_RATING) * 59)))
}

export const BALLSAI_RATING_V1 = {
  startingRating: STARTING_RATING,
  minRating: MIN_RATING,
  maxRating: MAX_RATING,
  kFactor: K_FACTOR,
}
