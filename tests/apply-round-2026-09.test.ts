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
    expect(stepOf('50-anon-definer')).toBe(Math.max(...steps.map(match => Number(match[1]))))
  })

  it('never lists a file that must not be applied', () => {
    expect(steps.map(match => match[2]).join('\n')).not.toMatch(/supabase-rls-private-slips|sample-data|20-tournament-roster/)
  })

  it('checks status without writing anything', () => {
    expect(status).toMatch(/\bselect\b/i)
    expect(status).not.toMatch(/\b(insert|update|delete|alter|drop|create|grant|revoke|truncate)\b/i)
    expect(status.match(/^\s*\((\d+),/gm)).toHaveLength(14)
  })
})
