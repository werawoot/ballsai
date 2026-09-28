import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('53-athletes-directory-index-v1.sql')
const migration = raw.replace(/\s+/g, ' ')

// /athletes pages public profiles of one sport by (created_at desc, user_id) (T45). Without
// an index in that order every page sorts every public athlete in the country.
describe('SQL53 index for the paginated athlete directory', () => {
  it('matches the directory query: public, one sport, newest first, user_id tiebreak', () => {
    expect(migration).toMatch(/create index if not exists athlete_profiles_directory_page_idx on public\.athlete_profiles \(sport, created_at desc, user_id\) where is_public/i)
  })

  it('only adds an index and checks it before committing', () => {
    expect(migration).not.toMatch(/\b(drop|alter|grant|revoke|insert|update|delete|truncate)\b/i)
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toMatch(/raise exception/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['53-athletes-directory-index-precheck.sql', '53-athletes-directory-index-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
