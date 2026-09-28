import { describe, expect, it } from 'vitest'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { PUBLIC_PROFILE_COLUMNS, ageOn, fetchAthleteAge, fetchMyAthletePrivate, saveAthleteProfile } from '@/lib/athlete-private'

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
const now = new Date('2026-09-28T05:00:00Z')

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
    expect(await fetchAthleteAge(client, 'kid', now)).toBe(11)
    expect(calls).toEqual(['rpc public_athlete_age {"p_user_id":"kid"}'])
  })

  it('until SQL58, reads the birth date the old way and still hands back only an age', async () => {
    const { client, calls } = fakeClient({ rpc: missingFunction, select: { data: { birth_date: '2014-09-29' }, error: null } })
    expect(await fetchAthleteAge(client, 'kid', now)).toBe(11)
    expect(calls).toEqual(['rpc public_athlete_age {"p_user_id":"kid"}', 'select athlete_profiles birth_date', 'eq user_id=kid'])
  })

  it('shows no age rather than failing the page when the database errs', async () => {
    const { client } = fakeClient({ rpc: { data: null, error: { message: 'boom' } } })
    expect(await fetchAthleteAge(client, 'kid', now)).toBeNull()
  })

  it('reads the athlete\'s own birth date and consent through my_athlete_private', async () => {
    const { client, calls } = fakeClient({ rpc: { data: [{ birth_date: '2014-01-02', guardian_consent_at: '2026-01-01T00:00:00Z' }], error: null } })
    expect(await fetchMyAthletePrivate(client, 'me')).toEqual({ birth_date: '2014-01-02', guardian_consent_at: '2026-01-01T00:00:00Z' })
    expect(calls).toEqual(['rpc my_athlete_private {}'])
  })

  it('until SQL58, reads the athlete\'s own row', async () => {
    const { client, calls } = fakeClient({ rpc: missingFunction, select: { data: { birth_date: '2014-01-02', guardian_consent_at: null }, error: null } })
    expect(await fetchMyAthletePrivate(client, 'me')).toEqual({ birth_date: '2014-01-02', guardian_consent_at: null })
    expect(calls.slice(1)).toEqual(['select athlete_profiles birth_date, guardian_consent_at', 'eq user_id=me'])
  })

  it('answers nothing for an athlete with no profile yet', async () => {
    const { client } = fakeClient({ rpc: { data: [], error: null } })
    expect(await fetchMyAthletePrivate(client, 'me')).toEqual({ birth_date: null, guardian_consent_at: null })
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

  it('reads the birth date or consent time only on the paths kept until SQL58 is applied', () => {
    const private_ = reads.filter(read => /birth_date|guardian_consent_at|LEGACY_COLUMNS/.test(read.columns)).map(read => read.file).sort()
    expect(private_).toEqual(['lib/athlete-private.ts', 'lib/athlete-private.ts', 'lib/public-athletes.ts', 'lib/public-identity-ranking.ts'])
  })
})
