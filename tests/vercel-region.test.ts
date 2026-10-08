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
