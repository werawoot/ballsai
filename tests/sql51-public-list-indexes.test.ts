import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (name: string) => readFileSync(new URL(`../sql/${name}`, import.meta.url), 'utf8')
const code = (name: string) => read(name).split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')
const raw = code('51-public-list-pagination-indexes-v1.sql')
const migration = raw.replace(/\s+/g, ' ')

// /venues and /tournaments read one page at a time (T07/T08), ordered with a unique id
// tiebreak. Without an index in that exact order Postgres sorts every published venue or
// every tournament to return twenty rows, so each page costs the whole table.
describe('SQL51 indexes for the paginated public lists', () => {
  it('covers /venues: published only, newest first, id tiebreak', () => {
    expect(migration).toMatch(/create index if not exists venue_profiles_published_page_idx on public\.venue_profiles \(created_at desc, id\) where is_published/i)
  })

  it('covers /tournaments: start date, id tiebreak', () => {
    expect(migration).toMatch(/create index if not exists tournaments_start_date_page_idx on public\.tournaments \(start_date, id\)/i)
  })

  it('only adds indexes and checks them before committing', () => {
    expect(migration).not.toMatch(/\b(drop|alter|grant|revoke|insert|update|delete|truncate)\b/i)
    expect(raw).toMatch(/^begin;/m)
    expect(migration).toMatch(/raise exception/)
    expect(raw).toMatch(/^commit;\s*$/m)
  })

  it.each(['51-public-list-pagination-indexes-precheck.sql', '51-public-list-pagination-indexes-postcheck.sql'])('%s only reads', name => {
    expect(code(name)).toMatch(/\bselect\b/i)
    expect(code(name)).not.toMatch(/^\s*(insert|update|delete|alter|drop|create|grant|revoke|truncate|do)\b/im)
  })
})
