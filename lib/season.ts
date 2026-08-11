// The active competition window.
//
// Ranking, Hall of Fame, match results and Player Cards all read one sport and one
// season. These used to be written as 'football' and '2026' in every query, so opening
// a new season meant hunting literals across a dozen files and silently emptying any
// page that was missed. Both values are read from the environment at build time and
// fall back to the current beta window, so nothing changes until they are set.
//
// Set NEXT_PUBLIC_ACTIVE_SEASON in Vercel to roll the platform into a new season. The
// data of older seasons stays in place: Hall of Fame keeps its own season filter, and
// `/ranking` can still be pointed at another sport through its query string.

export const ACTIVE_SPORT = process.env.NEXT_PUBLIC_ACTIVE_SPORT?.trim() || 'football'
export const ACTIVE_SEASON = process.env.NEXT_PUBLIC_ACTIVE_SEASON?.trim() || '2026'
