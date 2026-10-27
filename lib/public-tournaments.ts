import type { SupabaseClient } from '@supabase/supabase-js'

export const TOURNAMENTS_PAGE_SIZE = 20

// The columns the public list shows. The row carries more (select *), which the page
// passes on untouched.
export type PublicTournament = {
  id: string
  name: string
  description: string | null
  location: string | null
  start_date: string
  end_date?: string | null
  fee: number
  max_teams?: number | null
  status: string | null
}

/**
 * The tabs of /tournaments. "upcoming" is everything not over yet (a league that started
 * last month and runs to next month is still upcoming); "open" narrows that to what still
 * takes registrations; "past" is what is over, newest first.
 */
export type TournamentView = 'upcoming' | 'open' | 'past'
export const TOURNAMENT_VIEWS: readonly TournamentView[] = ['upcoming', 'open', 'past']

export function parseTournamentView(value: string | string[] | undefined): TournamentView {
  const raw = Array.isArray(value) ? value[0] : value
  return (TOURNAMENT_VIEWS as readonly string[]).includes(raw ?? '') ? raw as TournamentView : 'upcoming'
}

/** Today's date in Thailand as YYYY-MM-DD: the tournament dates are Thai calendar days. */
export function bangkokToday(now = new Date()): string {
  // en-CA formats a date as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/**
 * How a tab is ordered. "soonest" and "latest" are by start date, served in both
 * directions by tournaments_start_date_page_idx (sql/51); "fee" is the lowest fee first,
 * over the few rows a tab holds at a time.
 */
export type TournamentSort = 'soonest' | 'latest' | 'fee'
export const TOURNAMENT_SORTS: readonly TournamentSort[] = ['soonest', 'latest', 'fee']

export function parseTournamentSort(value: string | string[] | undefined, view: TournamentView): TournamentSort {
  const raw = Array.isArray(value) ? value[0] : value
  if ((TOURNAMENT_SORTS as readonly string[]).includes(raw ?? '')) return raw as TournamentSort
  return view === 'past' ? 'latest' : 'soonest'
}

/** The longest search the list accepts; a name or a venue is far shorter. */
export const TOURNAMENT_QUERY_MAX = 60

/**
 * A search as plain words. Characters that carry meaning in a PostgREST filter or a LIKE
 * pattern (, ( ) * % \ " ' and the like) become spaces, so what a person types can only
 * ever be text to look for, never part of the filter itself.
 */
export function parseTournamentQuery(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  return (raw ?? '').replace(/[,()*%\\"'`:;]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TOURNAMENT_QUERY_MAX)
}

// One page of tournaments for a tab. One row more than a page is fetched to tell whether
// a next page exists without a count(*) over the whole table. The API always writes
// end_date (it defaults to start_date), so "over" is end_date before today.
// Ordered by (start_date, id), which tournaments_start_date_page_idx (sql/51) serves in
// both directions; many tournaments share a start date and the id keeps pages disjoint.
// A search matches the name or the venue anywhere, case-insensitively; sql/90 gives both
// columns a trigram index so it stays fast with a nationwide table.
export async function fetchPublicTournamentsPage(client: SupabaseClient, { page, view, today, query: search = '', sort }: { page: number; view: TournamentView; today: string; query?: string; sort?: TournamentSort }) {
  const from = (page - 1) * TOURNAMENTS_PAGE_SIZE
  const order = sort ?? (view === 'past' ? 'latest' : 'soonest')
  // A signed-in organizer's client can read their own drafts (sql/89); a public list never shows one.
  let query = client.from('tournaments').select('*').neq('status', 'draft')
  query = view === 'past' ? query.lt('end_date', today) : query.gte('end_date', today)
  if (view === 'open') query = query.eq('status', 'open')
  const words = parseTournamentQuery(search)
  // A dot (อ.เมือง, ต.บ้านใหม่) becomes the one-character wildcard, so it still matches
  // itself without a dot reaching the filter syntax.
  const pattern = words.replaceAll('.', '_')
  if (words) query = query.or(`name.ilike.*${pattern}*,location.ilike.*${pattern}*`)
  if (order === 'fee') query = query.order('fee', { ascending: true }).order('start_date', { ascending: true })
  else query = query.order('start_date', { ascending: order === 'soonest' })
  const { data, error } = await query
    .order('id', { ascending: order !== 'latest' })
    .range(from, from + TOURNAMENTS_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as PublicTournament[]
  return { tournaments: rows.slice(0, TOURNAMENTS_PAGE_SIZE), hasNext: rows.length > TOURNAMENTS_PAGE_SIZE }
}

/** A page split into months (YYYY-MM), in the order the rows came. */
export function groupTournamentsByMonth<T extends { start_date: string }>(rows: T[]): Array<{ month: string; tournaments: T[] }> {
  const groups: Array<{ month: string; tournaments: T[] }> = []
  for (const row of rows) {
    const month = row.start_date.slice(0, 7)
    const last = groups.at(-1)
    if (last?.month === month) last.tournaments.push(row)
    else groups.push({ month, tournaments: [row] })
  }
  return groups
}
