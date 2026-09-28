/**
 * Pure parts of the concurrency checks (T14), kept free of I/O so they can be tested:
 * where the script may run, and how a burst of simultaneous answers is judged.
 *
 * An answer is { status, body } from PostgREST. A success is any 2xx; an error carries
 * the database's message (e.g. SLOT_ALREADY_REQUESTED) in body.message.
 */

export const STAGING_REF = 'vorpnkedpscsqhnrssrl'
export const PRODUCTION_REF = 'hivedzrwrrcnjrlirhtv'

// The checks write on purpose. They run against Staging only, and only when asked.
export function assertMayRun(url, allowWrites) {
  if (!url) return 'NEXT_PUBLIC_SUPABASE_URL is not set'
  if (url.includes(PRODUCTION_REF)) return `refusing to run against Production (${PRODUCTION_REF})`
  if (!url.includes(STAGING_REF)) return `refusing to run outside Staging (${STAGING_REF})`
  if (allowWrites !== 'true') return 'set ALLOW_CONCURRENCY_WRITES=true: every check writes test data to Staging'
  return null
}

const ok = answer => answer.status >= 200 && answer.status < 300
const messageOf = answer => {
  const body = answer.body
  if (body && typeof body === 'object') return String(body.message ?? body.code ?? JSON.stringify(body))
  return String(body ?? answer.status)
}

// Counts successes and groups failures by message.
export function tally(answers) {
  const errors = {}
  for (const answer of answers.filter(item => !ok(item))) {
    const message = messageOf(answer)
    errors[message] = (errors[message] ?? 0) + 1
  }
  return { successes: answers.filter(ok).length, errors }
}

const onlyExpectedErrors = (errors, expected) => Object.keys(errors).every(message => expected.some(token => message.includes(token)))

// Exactly one caller wins; every other one is refused with an expected reason.
export function judgeOneWinner(answers, expectedErrors) {
  const { successes, errors } = tally(answers)
  const passed = successes === 1 && onlyExpectedErrors(errors, expectedErrors)
  return { passed, detail: `${successes} succeeded; refused: ${JSON.stringify(errors)}` }
}

// At most one caller wins (none when the thing already existed before the burst).
export function judgeAtMostOne(answers, expectedErrors) {
  const { successes, errors } = tally(answers)
  const passed = successes <= 1 && onlyExpectedErrors(errors, expectedErrors)
  return { passed, detail: `${successes} succeeded; refused: ${JSON.stringify(errors)}` }
}

// Every caller succeeds and gets the same answer back: a repeat is the same request.
export function judgeSameAnswer(answers) {
  const { successes, errors } = tally(answers)
  const distinct = new Set(answers.filter(ok).map(answer => JSON.stringify(answer.body)))
  const passed = successes === answers.length && distinct.size === 1
  return { passed, detail: `${successes}/${answers.length} succeeded with ${distinct.size} distinct answer(s); errors: ${JSON.stringify(errors)}` }
}

// The draw that moves no rating: the case the old guard could not tell apart.
export function unchangedDrawPayload({ playerRankId, teamId, rating }) {
  return [{
    playerRankId, teamId, result: 'draw',
    ratingBefore: rating, ratingAfter: rating, ratingChange: 0, matchChange: 0, performanceBonus: 0,
    opponentRating: rating, goals: 0, assists: 0, cleanSheet: false, mvp: false, savePercentage: null,
  }]
}
