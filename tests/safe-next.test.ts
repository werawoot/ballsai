import { describe, expect, it } from 'vitest'
import { LANDING_PATH, safeNextPath } from '@/lib/safe-next'

// After signing in, a person lands on "ของฉัน" (UX report 9, D2) unless they were sent to sign
// in from a specific page. The path must stay on this site: never another origin.
describe('where someone lands after signing in', () => {
  it('is ของฉัน (/profile) when no page asked for them to sign in', () => {
    expect(LANDING_PATH).toBe('/profile')
    expect(safeNextPath(undefined)).toBe('/profile')
    expect(safeNextPath(null)).toBe('/profile')
    expect(safeNextPath('')).toBe('/profile')
  })
  it('goes back to the page that asked for the sign-in', () => {
    expect(safeNextPath('/tournaments/abc')).toBe('/tournaments/abc')
    expect(safeNextPath('/dashboard?pending=2')).toBe('/dashboard?pending=2')
  })
  it('never leaves this site', () => {
    expect(safeNextPath('//evil.example')).toBe('/profile')
    expect(safeNextPath('https://evil.example')).toBe('/profile')
    expect(safeNextPath('javascript:alert(1)')).toBe('/profile')
  })
  it('never leaves this site through a backslash or a control character', () => {
    // Browsers read "/\\host" as "//host": a redirect there goes to another site.
    expect(safeNextPath('/\\evil.example')).toBe('/profile')
    expect(safeNextPath('/\\/evil.example')).toBe('/profile')
    expect(safeNextPath('/\tevil.example')).toBe('/profile')
    expect(safeNextPath('/ok\nSet-Cookie:x')).toBe('/profile')
  })
})
