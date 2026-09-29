import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('../app/globals.css', import.meta.url), 'utf8')

// T37 (owner-approved change to the home page, AGENTS.md rule 7): on 320-380px phones the
// 25px logo left no room and the sign-in button wrapped and ran 25px off screen. A rule
// for those widths only keeps it on one line inside the 16px gutter; 390px and desktop
// were pixel-identical before and after.
describe('home header on small phones', () => {
  const rule = css.match(/@media \(max-width: 380px\) \{([^\n]*)\}\n/)?.[1] ?? ''

  it('has a rule for 380px and below only', () => {
    expect(rule).not.toBe('')
    expect(css.match(/@media \(max-width: 380px\)/g)).toHaveLength(1)
  })

  it('keeps the sign-in button on one line and makes room with a smaller logo', () => {
    expect(rule).toMatch(/\.home-login \{[^}]*white-space: nowrap/)
    expect(rule).toMatch(/\.home-logo \{[^}]*font-size: 17px/)
  })

  it('changes no colour or background on the home page', () => {
    expect(rule).not.toMatch(/color|background/)
  })
})
