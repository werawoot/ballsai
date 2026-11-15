import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { freshNavigation } from '@/lib/fresh-navigation'
import { sourceFiles } from './source-files'

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

// The pair on one router object, whatever it is called: its navigation, then its refresh in the
// same statement block (no closing brace between), on the same line or later, comments allowed.
const PAIR = /\b(\w+)\.(replace|push)\((?:[^{}]|\{[^{}]*\})*?\b\1\.refresh\(\)/

describe('client code', () => {
  it('never calls router.refresh() right after router.replace() or router.push()', () => {
    const offenders = sourceFiles(['app', 'components', 'lib'])
      .filter(file => !file.endsWith('fresh-navigation.ts')) // the helper's own comment names the pair
      .filter(file => PAIR.test(readFileSync(file, 'utf8')))
    expect(offenders).toEqual([])
  })

  it('the scan catches the pair however it is written', () => {
    const pair = PAIR
    expect(pair.test("router.replace(x); router.refresh()")).toBe(true)
    expect(pair.test("router.push(`/a/${id}`)\n  // fresh data\n\n  await router.refresh()")).toBe(true)
    expect(pair.test("router.replace(\n  next,\n)\nvoid router.refresh()")).toBe(true)
    expect(pair.test("r.push('/x'); r.refresh()")).toBe(true)
    // Two different routers are not the pair.
    expect(pair.test("a.push('/x'); b.refresh()")).toBe(false)
    // A refresh in another branch, after the block closes, is not the pair.
    expect(pair.test("if (a) { router.push('/x'); return }\n}\nfunction b() { router.refresh() }")).toBe(false)
  })
})
