import type { SupabaseClient } from '@supabase/supabase-js'

// A child's birth date and the time a guardian consented are not the public's (T50).
// After sql/58 no one but the athlete can read them; everyone else gets an age worked out
// in the database. Read athlete_profiles with these columns, never with '*': SQL58 grants
// SELECT column by column, and '*' would ask for the two it withholds.
export const PUBLIC_PROFILE_COLUMNS = 'user_id, display_name, sport, position, province, height_cm, weight_kg, current_team, bio, profile_image_url, is_public, verification_level, verified_at, created_at, updated_at'

type Failure = { code?: string; message: string } | null
export type AthletePrivate = { birth_date: string | null; guardian_consent_at: string | null }

// PostgREST answers PGRST202 for a function it does not know; Postgres itself 42883.
// Either means SQL58 is not applied yet.
const isMissingFunction = (error: Failure) => error?.code === 'PGRST202' || error?.code === '42883'

// Today's date in Thailand as YYYY-MM-DD: an age turns over at midnight Bangkok time,
// whatever time zone the server runs in.
export function thaiDate(now: Date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

// Whole years between a birth date and a day, both YYYY-MM-DD.
export function ageOn(birthDate: string, today: string) {
  const [birthYear, birthMonth, birthDay] = birthDate.split('-').map(Number)
  const [year, month, day] = today.split('-').map(Number)
  return year - birthYear - (month < birthMonth || (month === birthMonth && day < birthDay) ? 1 : 0)
}

// The age of a public athlete, or of the signed-in athlete's own profile; null when the
// database gives none. A failed read shows no age rather than failing the page.
export async function fetchAthleteAge(client: SupabaseClient, userId: string, now = new Date()): Promise<number | null> {
  const { data, error } = await client.rpc('public_athlete_age', { p_user_id: userId })
  if (!error) return typeof data === 'number' ? data : null
  if (!isMissingFunction(error)) {
    console.error(JSON.stringify({ level: 'error', event: 'athlete_age_failed', code: error.code ?? null }))
    return null
  }
  // Before SQL58. Delete once it is applied on Production.
  const legacy = await client.from('athlete_profiles').select('birth_date').eq('user_id', userId).maybeSingle()
  const birthDate = (legacy.data as { birth_date?: string | null } | null)?.birth_date
  return birthDate ? ageOn(birthDate, thaiDate(now)) : null
}

// The signed-in athlete's own birth date and consent time, for /profile.
export async function fetchMyAthletePrivate(client: SupabaseClient, userId: string): Promise<AthletePrivate> {
  const empty = { birth_date: null, guardian_consent_at: null }
  const { data, error } = await client.rpc('my_athlete_private')
  if (!error) {
    const row = (Array.isArray(data) ? data[0] : data) as Partial<AthletePrivate> | undefined
    return row ? { birth_date: row.birth_date ?? null, guardian_consent_at: row.guardian_consent_at ?? null } : empty
  }
  if (!isMissingFunction(error)) throw error
  // Before SQL58. Delete once it is applied on Production.
  const legacy = await client.from('athlete_profiles').select('birth_date, guardian_consent_at').eq('user_id', userId).maybeSingle()
  if (legacy.error) throw legacy.error
  const row = legacy.data as Partial<AthletePrivate> | null
  return row ? { birth_date: row.birth_date ?? null, guardian_consent_at: row.guardian_consent_at ?? null } : empty
}

// Saves the athlete's own profile with a plain insert or update. An upsert would make
// Postgres read the birth date back (ON CONFLICT reads EXCLUDED), which SQL58 forbids.
// Saving twice, or from two tabs at once, has the effect of one save.
export async function saveAthleteProfile(client: SupabaseClient, row: Record<string, unknown> & { user_id: string }, exists: boolean): Promise<{ error: Failure }> {
  const { user_id: userId, ...fields } = row
  const update = async () => (await client.from('athlete_profiles').update(fields).eq('user_id', userId)).error as Failure
  if (exists) return { error: await update() }
  const inserted = (await client.from('athlete_profiles').insert(row)).error as Failure
  if (inserted?.code === '23505') return { error: await update() }
  return { error: inserted }
}
