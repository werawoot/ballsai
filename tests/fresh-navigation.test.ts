import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { freshNavigation } from '@/lib/fresh-navigation'

// After a write, one router call, never router.replace()/push() followed by router.refresh():
// Next cancels both requests now and then and the page keeps old data (docs/e2e.md, 14 Nov 2026,
// reproduced 2 of 30 on the goal step).

describe('freshNavigation', () => {
  const here = 'https://doensai.com/training?tab=programs'

  it('refreshes when the destination is the page already open', () => {
    expect(freshNavigation('/training?tab=programs', here)).toBe('refresh')
    expect(freshNavigation('https://doensai.com/training?tab=programs', here)).toBe('refresh')
  })

  it('navigates when the destination differs, in path or query', () => {
    expect(freshNavigation('/training?band=u10_u13&tab=programs', here)).toBe('navigate')
    expect(freshNavigation('/training/u10-foundation-01/session', here)).toBe('navigate')
    expect(freshNavigation('/training', here)).toBe('navigate')
  })

  it('ignores a hash, which never reaches the server', () => {
    expect(freshNavigation('/training?tab=programs#goal', here)).toBe('refresh')
  })
})

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : []
  })
}

describe('client code', () => {
  it('never calls router.refresh() right after router.replace() or router.push()', () => {
    const offenders = [...sources('app'), ...sources('components')].filter(file =>
      /router\.(replace|push)\([^\n]*\)[;\s]*\n\s*router\.refresh\(\)/.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })
})
