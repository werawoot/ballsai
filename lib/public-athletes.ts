import type { SupabaseClient } from '@supabase/supabase-js'
import { ageOn, shownAge, thaiDate } from '@/lib/athlete-private'

export const ATHLETES_PAGE_SIZE = 24

// The profile fields the directory card shows. public_athlete_directory (sql/58) holds
// public profiles only and carries an age worked out in the database: a child's birth
// date never leaves it.
const DIRECTORY_COLUMNS = 'user_id, display_name, age, position, province, current_team, profile_image_url, verification_level'
// Before SQL58 the birth date is read from the profiles table, turned into an age here,
// and dropped. Delete this path once SQL58 is applied on Production.
const LEGACY_COLUMNS = 'user_id, display_name, birth_date, position, province, current_team, profile_image_url, verification_level'

export type PublicAthlete = {
  user_id: string
  display_name: string
  age?: number | null
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

// The same calendar day `years` earlier; 29 February becomes 28 February in a common year.
function yearsBefore(isoDate: string, years: number) {
  const [year, month, day] = isoDate.split('-').map(Number)
  const target = year - years
  const leap = (target % 4 === 0 && target % 100 !== 0) || target % 400 === 0
  const safeDay = month === 2 && day === 29 && !leap ? 28 : day
  return `${target}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`
}

// Age groups, filtered in the database before it pages. The legacy path turns them into
// birth-date bounds: younger than N <=> born after the day N years ago; N or older <=>
// born on or before it.
const UNDER: Record<string, number> = { u12: 12, u15: 15, u18: 18 }
const ADULT_FROM = 20

// PostgREST answers PGRST205 for a view it does not know; Postgres itself 42P01.
const isMissingView = (error: { code?: string } | null) => error?.code === 'PGRST205' || error?.code === '42P01'

// One page of public athlete profiles, newest first, with the ranks of just those athletes.
// One row more than a page is read to tell whether a next page exists without counting
// every public athlete in the country on each view.
export async function fetchPublicAthletesPage(client: SupabaseClient, options: Options) {
  const { page, sport, season, search, province, position, ageGroup, today: now = new Date() } = options
  const from = (page - 1) * ATHLETES_PAGE_SIZE
  const today = thaiDate(now)
  // Profiles created in the same instant have no defined order; the unique tiebreak keeps
  // every athlete on exactly one page.
  const onePage = <Q extends { order: (column: string, options: { ascending: boolean }) => Q; range: (from: number, to: number) => unknown }>(query: Q) =>
    query.order('created_at', { ascending: false }).order('user_id', { ascending: true }).range(from, from + ATHLETES_PAGE_SIZE)

  let directory = client.from('public_athlete_directory').select(DIRECTORY_COLUMNS).eq('sport', sport)
  if (search) directory = directory.ilike('display_name', `%${search}%`)
  if (province) directory = directory.eq('province', province)
  if (position) directory = directory.eq('position', position)
  if (ageGroup && ageGroup in UNDER) directory = directory.lt('age', UNDER[ageGroup])
  if (ageGroup === 'adult') directory = directory.gte('age', ADULT_FROM)
  let { data, error } = await (onePage(directory) as unknown as Promise<{ data: unknown[] | null; error: { code?: string } | null }>)

  if (isMissingView(error)) {
    let legacy = client.from('athlete_profiles').select(LEGACY_COLUMNS).eq('is_public', true).eq('sport', sport)
    if (search) legacy = legacy.ilike('display_name', `%${search}%`)
    if (province) legacy = legacy.eq('province', province)
    if (position) legacy = legacy.eq('position', position)
    if (ageGroup && ageGroup in UNDER) legacy = legacy.gt('birth_date', yearsBefore(today, UNDER[ageGroup]))
    if (ageGroup === 'adult') legacy = legacy.lte('birth_date', yearsBefore(today, ADULT_FROM))
    const answer = await (onePage(legacy) as unknown as Promise<{ data: unknown[] | null; error: { code?: string } | null }>)
    error = answer.error
    data = ((answer.data ?? []) as (PublicAthlete & { birth_date?: string | null })[]).map(({ birth_date: birthDate, ...athlete }) => ({
      ...athlete, age: birthDate ? ageOn(birthDate, today) : null,
    }))
  }
  if (error) throw error
  const rows = (data ?? []) as PublicAthlete[]
  const athletes = rows.slice(0, ATHLETES_PAGE_SIZE).map(athlete => ({ ...athlete, age: shownAge(athlete.age ?? null) }))
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
