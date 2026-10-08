import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Chrome test, 8 Oct 2026: /profile, /athletes and /players/[id] took 4-5 s. Supabase (Production
// and Staging) is in Singapore, ap-southeast-1 (docs/supabase-settings-2026-09-30.md). A page makes
// several round trips to it one after another, so the functions run in Singapore too (sin1), not in
// Vercel's default region in the United States. It also keeps minors' data processed where it is stored.
describe('vercel.json', () => {
  it('runs the server functions in Singapore, next to Supabase', () => {
    const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
    expect(config.regions).toEqual(['sin1'])
  })
})

// The hero loads three photos as CSS backgrounds. Phones get a portrait crop sized for a phone
// screen instead of the 2200px desktop photo; the crop is the same centre a phone already shows.
describe('home hero photos on a phone', () => {
  it('are portrait crops no wider than 900px under 650px', () => {
    const css = readFileSync('app/globals.css', 'utf8')
    const mobile = css.match(/@media \(max-width: 650px\) \{ \.home-hero-slide:nth-child\(1\)[^\n]*/)?.[0] ?? ''
    for (const n of [1, 2, 3]) expect(mobile).toMatch(new RegExp(`\\.home-hero-slide:nth-child\\(${n}\\) \\{ --slide-photo:url\\('https://images\\.unsplash\\.com/[^']*w=900&h=1300`))
  })
})
