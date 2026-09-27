import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Touch targets that were measured below Apple's 44pt minimum at 320px and 375px:
// "ดูรายละเอียด" 42.5px, /athletes selects 42px, Hall of Fame chips 33-35px and its
// empty-state link 38px.

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')
const css = read('app/globals.css')
const block = css.slice(css.indexOf('/* Hall of Fame filter chips'))
const rule = (selector: string) => {
  const start = block.indexOf(`\n${selector} {`)
  expect(start, `${selector} must exist`).toBeGreaterThan(-1)
  return block.slice(start, block.indexOf('}', start))
}
const px = (source: string, pattern: RegExp) => Number(source.match(pattern)?.[1])

describe('ordinary pages grow the control itself', () => {
  it('makes "ดูรายละเอียด" on a tournament card at least 44px tall', () => {
    const button = read('app/tournaments/page.tsx').match(/<Link className="bds-primary"[^>]*>/)?.[0] ?? ''
    expect(px(button, /minHeight: (\d+)/)).toBeGreaterThanOrEqual(44)
    expect(button).toContain("boxSizing: 'border-box'")
  })

  it('makes every /athletes filter select at least 44px tall', () => {
    const filters = read('app/athletes/AthleteFilters.tsx')
    expect(px(filters, /const selectStyle = \{[^}]*minHeight: (\d+)/)).toBeGreaterThanOrEqual(44)
    expect(filters.match(/<select\b/g)?.length).toBe(3)
    expect(filters.match(/style=\{selectStyle\}/g)?.length).toBe(3)
  })
})

describe('Hall of Fame keeps its look and grows only the hit area', () => {
  const CHIP_HEIGHTS = [33, 35] // secondary (age) row and category row, measured

  it('reaches 44px for every chip height, inside what the scrolling row can show', () => {
    const chip = rule('.hall-filter-row a::before')
    // Offsets count from the padding box, one border inside the chip's edge.
    const border = px(css, /\.hall-filter-row a \{ border:(\d+)px/)
    expect(chip).toContain(`bottom:-${border}px`)
    const reach = px(chip, /calc\(100% - (\d+)px\)/)
    const padTop = px(rule('.hall-filter-row'), /padding-top:(\d+)px/)
    for (const height of CHIP_HEIGHTS) {
      const padding = height - 2 * border
      const top = Math.min(-border, padding - reach) // relative to the padding box top
      const hit = (padding + border) - top // down to the chip's bottom edge
      expect(hit).toBeGreaterThanOrEqual(44)
      expect(-top - border, 'fits in the padding the row gains').toBeLessThanOrEqual(padTop)
    }
    expect(chip).toContain('width:max(100%,44px)')
  })

  it('gives the row its padding back, so nothing on screen moves', () => {
    const row = rule('.hall-filter-row')
    expect(px(row, /margin-top:-(\d+)px/)).toBe(px(row, /padding-top:(\d+)px/))
    expect(row).not.toMatch(/padding-bottom|margin-bottom|border/)
  })

  it('cannot reach the chips of the row above, and never reaches below its own chip', () => {
    // Rows sit 4px padding + 1px border + 10px margin = 15px apart.
    const chip = rule('.hall-filter-row a::before')
    const reachUp = 44 - Math.min(...CHIP_HEIGHTS)
    expect(reachUp).toBeLessThan(15)
    expect(px(rule('.hall-filter-row'), /padding-top:(\d+)px/)).toBe(reachUp)
    expect(chip).toContain('bottom:-1px')
  })

  it('makes the empty-state link at least 44px each way', () => {
    const link = rule('.hall-empty a::before')
    expect(link).toContain('height:max(100%,44px)')
    expect(link).toContain('width:max(100%,44px)')
  })

  it('draws nothing: the hit areas are invisible', () => {
    for (const selector of ['.hall-filter-row a::before', '.hall-empty a::before']) {
      expect(rule(selector)).not.toMatch(/background|border|color|box-shadow/)
    }
  })

  it('still has the chips and the link it enlarges', () => {
    const page = read('app/hall-of-fame/page.tsx')
    expect(page).toContain('className="hall-filter-row"')
    expect(page).toContain('className="hall-filter-row hall-filter-secondary"')
    expect(page).toMatch(/<div className="hall-empty">[\s\S]*<Link href="\/ranking">/)
  })
})
