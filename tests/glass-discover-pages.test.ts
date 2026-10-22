import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-014: the home page links to /ranking and to each athlete's /players/[id], so both move
// to the light glass design next (owner, 21 Oct 2026). Only the look moves: the data, the
// sources each number states, and the STARTER card stay as they were (AGENTS.md rule 8).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe.each([
  ['/ranking', 'app/ranking/page.tsx', 'rk'],
  ['/players/[id]', 'app/players/[id]/page.tsx', 'pp'],
  ['/athletes', 'app/athletes/page.tsx', 'at'],
])('%s on the light glass design', (_route, file, prefix) => {
  const page = read(file)

  it('opts in with the glass scene over the blurred grass and loads the glass styles', () => {
    expect(page).toMatch(new RegExp(`<main className="bds-page ${prefix} gl gl-scene"`))
    expect(page).toContain("'--gl-backdrop-photo'")
    expect(page).toMatch(/import '(\.\.\/)+glass\.css'/)
  })

  it('heads the page with the licensed stadium photo, not the old red glow', () => {
    expect(page).toContain("'--gl-stadium-photo'")
    expect(page).not.toContain('ui-matchday')
  })
})

// The third view of the discover switch keeps its own header and honour cards; it opts in
// on its root and takes the stadium photo behind its head.
describe('/hall-of-fame on the light glass design', () => {
  const page = read('app/hall-of-fame/page.tsx')
  it('opts in with the glass scene and the stadium photo, and loads the glass styles', () => {
    expect(page).toContain('<main className="hall-page gl gl-scene"')
    expect(page).toContain("'--gl-backdrop-photo'")
    expect(page).toContain("'--gl-stadium-photo'")
    expect(page).toContain("import '../glass.css'")
  })
})

describe('/players/[id] keeps where every number comes from', () => {
  const page = read('app/players/[id]/page.tsx')
  it('still shows STARTER for a card with no rank row and the source chip on the card', () => {
    expect(page).toContain("'STARTER'")
    expect(page).toContain('pp-card-chip is-${provenance}')
    expect(page).toContain("t('skillDash')")
  })
})
