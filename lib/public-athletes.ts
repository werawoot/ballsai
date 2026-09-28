import type { SupabaseClient } from '@supabase/supabase-js'

export const ATHLETES_PAGE_SIZE = 24

// The profile fields the directory card shows. birth_date is read to print an age on the
// card; nothing else about the athlete leaves the database here.
const PROFILE_COLUMNS = 'user_id, display_name, birth_date, position, province, current_team, profile_image_url, verification_level'

export type PublicAthlete = {
  user_id: string
  display_name: string
  birth_date?: string | null
  position?: string | null
  province?: string | null
  current_team?: string | null
  profile_image_url?: string | null
  verification_level: 'self' | 'coach_verified' | 'performance_verified'
}
export type PublicAthleteRank = { id: string; player_id?: string | null; pts: number; ovr: number; position: string }

type Options = {
  page: number
  sport: string
  season: string
  search?: string
  province?: string
  position?: string
  ageGroup?: string
  today?: Date
}

// Today's date in Thailand as YYYY-MM-DD: an athlete's age turns over at midnight Bangkok
// time, whatever time zone the server runs in.
function thaiDate(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// The same calendar day `years` earlier; 29 February becomes 28 February in a common year.
function yearsBefore(isoDate: string, years: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const target = year - years
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0
  const safeDay = month === 2 && day === 29 && !leap ? 28 : day
  return `${target}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

// Age groups as birth-date bounds, so the database filters before it pages:
// younger than N  <=> born after the day N years ago; N or older <=> born on or before it.
const UNDER: Record<string, number> = { u12: 12, u15: 15, u18: 18 }
const ADULT_FROM = 20

// One page of public athlete profiles, newest first, with the ranks of just those athletes.
// One row more than a page is read to tell whether a next page exists without counting
// every public athlete in the country on each view.
export async function fetchPublicAthletesPage(client: SupabaseClient, options: Options) {
  const { page, sport, season, search, province, position, ageGroup, today = new Date() } = options
  const from = (page - 1) * ATHLETES_PAGE_SIZE
  let query = client.from('athlete_profiles').select(PROFILE_COLUMNS).eq('is_public', true).eq('sport', sport)
  if (search) query = query.ilike('display_name', `%${search}%`)
  if (province) query = query.eq('province', province)
  if (position) query = query.eq('position', position)
  if (ageGroup && ageGroup in UNDER) query = query.gt('birth_date', yearsBefore(thaiDate(today), UNDER[ageGroup]))
  if (ageGroup === 'adult') query = query.lte('birth_date', yearsBefore(thaiDate(today), ADULT_FROM))
  const { data, error } = await query
    .order('created_at', { ascending: false })
    // Profiles created in the same instant have no defined order; the unique tiebreak
    // keeps every athlete on exactly one page.
    .order('user_id', { ascending: true })
    .range(from, from + ATHLETES_PAGE_SIZE)
  if (error) throw error
  const rows = (data ?? []) as PublicAthlete[]
  const athletes = rows.slice(0, ATHLETES_PAGE_SIZE)
  const ids = athletes.map(athlete => athlete.user_id)
  let ranks: PublicAthleteRank[] = []
  if (ids.length) {
    const { data: rankRows, error: rankError } = await client
      .from('player_ranks')
      .select('id, player_id, pts, ovr, position')
      .in('player_id', ids)
      .eq('sport', sport)
      .eq('season', season)
      .limit(ATHLETES_PAGE_SIZE)
    if (rankError) throw rankError
    ranks = (rankRows ?? []) as PublicAthleteRank[]
  }
  return { athletes, ranks, hasNext: rows.length > ATHLETES_PAGE_SIZE }
}
