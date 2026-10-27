import { describe, expect, it, vi } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PUBLIC_PROFILE_COLUMNS, ageOn, birthDateIssue, fetchAthleteAge, fetchMyAthletePrivate, saveAthleteProfile } from '@/lib/athlete-private'

type Answer = { data: unknown; error: { code?: string; message: string } | null }

// A stand-in for supabase-js: records every call and answers from the given script.
function fakeClient(answers: { rpc?: Answer; select?: Answer; insert?: Answer; update?: Answer }) {
  const calls: string[] = []
  const settle = (answer: Answer | undefined) => Promise.resolve(answer ?? { data: null, error: null })
  const client = {
    rpc: (name: string, args?: unknown) => { calls.push(`rpc ${name} ${JSON.stringify(args ?? {})}`); return settle(answers.rpc) },
    from: (table: string) => ({
      select: (columns: string) => {
        calls.push(`select ${table} ${columns}`)
        const chain = { eq: (column: string, value: unknown) => { calls.push(`eq ${column}=${value}`); return chain }, maybeSingle: () => settle(answers.select) }
        return chain
      },
      insert: (row: Record<string, unknown>) => { calls.push(`insert ${table} ${Object.keys(row).sort().join(',')}`); return settle(answers.insert) },
      update: (row: Record<string, unknown>) => {
        calls.push(`update ${table} ${Object.keys(row).sort().join(',')}`)
        return { eq: (column: string, value: unknown) => { calls.push(`eq ${column}=${value}`); return settle(answers.update) } }
      },
    }),
  }
  return { client: client as never, calls }
}

const missingFunction = { data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }

// T50: once SQL58 is applied nobody but the athlete reads a birth date; everyone else gets
// an age from the database. Before SQL58 the same answers come from the old reads.
describe('athlete birth date and consent', () => {
  it('never lists the birth date or the consent time among the public profile columns', () => {
    const columns = PUBLIC_PROFILE_COLUMNS.split(',').map(column => column.trim())
    expect(columns).toEqual(expect.arrayContaining(['user_id', 'display_name', 'bio', 'height_cm', 'weight_kg', 'profile_image_url', 'is_public', 'verification_level']))
    expect(columns).not.toContain('birth_date')
    expect(columns).not.toContain('guardian_consent_at')
    expect(columns).not.toContain('*')
  })

  it('counts an age in whole years, turning over on the birthday', () => {
    expect(ageOn('2014-09-28', '2026-09-28')).toBe(12)
    expect(ageOn('2014-09-29', '2026-09-28')).toBe(11)
    expect(ageOn('2014-10-01', '2026-09-28')).toBe(11)
    expect(ageOn('2008-02-29', '2026-02-28')).toBe(17)
  })

  it('asks the database for an athlete\'s age', async () => {
    const { client, calls } = fakeClient({ rpc: { data: 11, error: null } })
    expect(await fetchAthleteAge(client, 'kid')).toBe(11)
    expect(calls).toEqual(['rpc public_athlete_age {"p_user_id":"kid"}'])
  })

  // SQL58 is on Staging and Production (T50): the birth date is never read from the table,
  // even when the function is missing.
  it('shows no age, and never reads the birth date itself, when the age function is missing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { client, calls } = fakeClient({ rpc: missingFunction, select: { data: { birth_date: '2014-09-29' }, error: null } })
    expect(await fetchAthleteAge(client, 'kid')).toBeNull()
    expect(calls).toEqual(['rpc public_athlete_age {"p_user_id":"kid"}'])
    error.mockRestore()
  })

  it('shows no age rather than failing the page when the database errs', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'boom' } } })
    expect(await fetchAthleteAge(client, 'kid')).toBeNull()
  })

  it('reads the athlete\'s own birth date and consent through my_athlete_private', async () => {
    const { client, calls } = fakeClient({ rpc: { data: [{ birth_date: '2014-01-02', guardian_consent_at: '2026-01-01T00:00:00Z' }], error: null } })
    expect(await fetchMyAthletePrivate(client)).toEqual({ birth_date: '2014-01-02', guardian_consent_at: '2026-01-01T00:00:00Z' })
    expect(calls).toEqual(['rpc my_athlete_private {}'])
  })

  it('reports a missing my_athlete_private instead of reading the row itself', async () => {
    const { client, calls } = fakeClient({ rpc: missingFunction, select: { data: { birth_date: '2014-01-02', guardian_consent_at: null }, error: null } })
    await expect(fetchMyAthletePrivate(client)).rejects.toMatchObject({ code: 'PGRST202' })
    expect(calls).toEqual(['rpc my_athlete_private {}'])
  })

  it('answers nothing for an athlete with no profile yet', async () => {
    const { client } = fakeClient({ rpc: { data: [], error: null } })
    expect(await fetchMyAthletePrivate(client)).toEqual({ birth_date: null, guardian_consent_at: null })
  })
})

// An upsert needs SELECT on every column it writes (Postgres reads EXCLUDED), which SQL58
// takes away for birth_date. A plain insert or update needs none.
describe('saving the athlete profile', () => {
  const row = { user_id: 'me', display_name: 'Som', birth_date: '2014-01-02', guardian_consent_at: null, is_public: false }

  it('updates an existing profile by its owner id', async () => {
    const { client, calls } = fakeClient({})
    expect(await saveAthleteProfile(client, row, true)).toEqual({ error: null })
    expect(calls).toEqual(['update athlete_profiles birth_date,display_name,guardian_consent_at,is_public', 'eq user_id=me'])
  })

  it('inserts a new profile with every field, the owner id included', async () => {
    const { client, calls } = fakeClient({})
    expect(await saveAthleteProfile(client, row, false)).toEqual({ error: null })
    expect(calls).toEqual(['insert athlete_profiles birth_date,display_name,guardian_consent_at,is_public,user_id'])
  })

  it('updates instead when the profile was created meanwhile (another tab, a retried save)', async () => {
    const { client, calls } = fakeClient({ insert: { data: null, error: { code: '23505', message: 'duplicate key' } } })
    expect(await saveAthleteProfile(client, row, false)).toEqual({ error: null })
    expect(calls).toEqual(['insert athlete_profiles birth_date,display_name,guardian_consent_at,is_public,user_id', 'update athlete_profiles birth_date,display_name,guardian_consent_at,is_public', 'eq user_id=me'])
  })

  it('passes any other error back, such as the guardian consent rule', async () => {
    const refused = { code: '22023', message: 'PUBLIC_REQUIRES_GUARDIAN_LINK' }
    const { client } = fakeClient({ update: { data: null, error: refused } })
    expect(await saveAthleteProfile(client, { ...row, is_public: true }, true)).toEqual({ error: refused })
  })
})

// Every read of athlete_profiles in the app names its columns. '*' or a birth date in a
// read breaks the page once SQL58 is applied, or hands the date to someone who may not see it.
describe('reads of athlete_profiles across the app', () => {
  const files = execSync('git ls-files --cached --others --exclude-standard app lib components', { encoding: 'utf8' }).split('\n').filter(file => /\.(ts|tsx)$/.test(file))
  const reads = files.flatMap(file => {
    const source = readFileSync(file, 'utf8').replace(/\s+/g, ' ')
    return [...source.matchAll(/from\(['"]athlete_profiles['"]\)\s*\.select\(([^)]*)\)/g)].map(match => ({ file, columns: match[1] }))
  })

  it('finds the reads it guards', () => {
    expect(reads.length).toBeGreaterThan(5)
  })

  it('never selects every column', () => {
    expect(reads.filter(read => /\*/.test(read.columns))).toEqual([])
  })

  it('never reads the birth date or consent time from the table (T50: only my_athlete_private does)', () => {
    const private_ = reads.filter(read => /birth_date|guardian_consent_at|LEGACY_COLUMNS/.test(read.columns)).map(read => read.file).sort()
    expect(private_).toEqual([])
  })
})

// Chrome test, 8 Oct 2026: a birth date of this year was accepted and the profile said "อายุ 0 ปี".
// Who can be an athlete here: 5 to 80 years old on the day the form is saved.
describe('birthDateIssue', () => {
  const today = '2026-10-08'
  it('accepts a 5-year-old and an 80-year-old', () => {
    expect(birthDateIssue('2021-10-08', today)).toBeNull()
    expect(birthDateIssue('1946-10-08', today)).toBeNull()
    expect(birthDateIssue('2014-03-15', today)).toBeNull()
  })
  it('refuses a birth date that gives an age under 5, including today', () => {
    expect(birthDateIssue('2026-10-08', today)).toBe('tooYoung')
    expect(birthDateIssue('2021-10-09', today)).toBe('tooYoung')
  })
  it('refuses a date after today', () => {
    expect(birthDateIssue('2026-10-09', today)).toBe('future')
  })
  it('refuses an age over 80, which is almost always a typed-in year', () => {
    expect(birthDateIssue('1945-10-08', today)).toBe('tooOld')
    expect(birthDateIssue('1900-01-01', today)).toBe('tooOld')
  })
  it('refuses anything that is not a whole date', () => {
    expect(birthDateIssue('2014-3-15', today)).toBe('invalid')
    expect(birthDateIssue('', today)).toBe('invalid')
  })
})

describe('an age outside 5-80 is never shown', () => {
  it('fetchAthleteAge gives no age for 0, and the age for 12', async () => {
    expect(await fetchAthleteAge(fakeClient({ rpc: { data: 0, error: null } }).client, 'u1')).toBeNull()
    expect(await fetchAthleteAge(fakeClient({ rpc: { data: 12, error: null } }).client, 'u1')).toBe(12)
  })
})
