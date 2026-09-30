import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const root = new URL('../', import.meta.url)
const read = (path: string) => readFileSync(new URL(path, root), 'utf8')
const guide = read('docs/apply-round-2026-09.md')
const status = read('sql/checks/apply-round-status.sql').split('\n').filter(line => !line.trimStart().startsWith('--')).join('\n')

// The owner applies SQL by following this guide step by step, on Staging and then on
// Production. A missing file, a wrong order or a status query that writes would each
// break a real database, so the guide is checked like code.
const steps = [...guide.matchAll(/^\| (\d+) \| (.+?) \|/gm)].filter(match => /sql\/|btree_gist/.test(match[2]))
const stepOf = (needle: string) => Number(steps.find(match => match[2].includes(needle))?.[1])

describe('the September apply round', () => {
  it('names only SQL files that exist', () => {
    const files = [...guide.matchAll(/`(sql\/[^`\s]+\.sql)`/g)].map(match => match[1])
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) expect(existsSync(new URL(file, root)), file).toBe(true)
  })

  it('keeps the order the files depend on', () => {
    expect(stepOf('42-notification')).toBeLessThan(stepOf('41-venue-booking'))
    expect(stepOf('btree_gist')).toBeLessThan(stepOf('46-venue-beta'))
    expect(stepOf('41-venue-booking')).toBeLessThan(stepOf('54-venue-cancel'))
    expect(stepOf('46-venue-beta')).toBeLessThan(stepOf('54-venue-cancel'))
    expect(stepOf('55-tournament-fixtures')).toBeLessThan(stepOf('56-fixture-results'))
    // SQL50 takes signed-out EXECUTE away from every definer function that exists when it
    // runs, so it comes after all of them -- except SQL57, which opens its public reader on
    // purpose and therefore has to come after SQL50; and SQL58, whose age reader is public
    // on purpose too. SQL61 revokes anon from its own function, so either side is safe;
    // it is listed after SQL50 because Staging had already applied SQL50. SQL62 creates no
    // function at all (bucket and storage policies only), so it sits at the end too.
    const afterRevoke = ['57-public-fixtures', '58-athlete-private', '61-first-match-rank', '62-private-athlete-avatars']
    expect(stepOf('50-anon-definer')).toBe(Math.max(...steps.filter(match => !afterRevoke.some(name => match[2].includes(name))).map(match => Number(match[1]))))
    for (const name of afterRevoke) expect(stepOf(name)).toBeGreaterThan(stepOf('50-anon-definer'))
    // SQL58 recreates SQL52's view and relies on SQL53's directory index.
    expect(stepOf('58-athlete-private')).toBeGreaterThan(stepOf('52-public-athlete-rankings'))
    expect(stepOf('58-athlete-private')).toBeGreaterThan(stepOf('53-athletes-directory'))
    // SQL61 records through SQL60's record_match_result_once.
    expect(stepOf('61-first-match-rank')).toBeGreaterThan(stepOf('60-match-result-request-id'))
  })

  it('never lists a file that must not be applied', () => {
    expect(steps.map(match => match[2]).join('\n')).not.toMatch(/supabase-rls-private-slips|sample-data|20-tournament-roster/)
  })

  it('checks status without writing anything', () => {
    expect(status).toMatch(/\bselect\b/i)
    expect(status).not.toMatch(/\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/i)
    expect(status.match(/^\s*\((\d+),/gm)).toHaveLength(21)
  })
})
