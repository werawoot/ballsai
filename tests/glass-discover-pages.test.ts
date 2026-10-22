import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// ADR-014: the home page links to /ranking and to each athlete's /players/[id], so both move
// to the light glass design next (owner, 21 Oct 2026). Only the look moves: the data, the
// sources each number states, and the STARTER card stay as they were (AGENTS.md rule 8).
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe.each([
  ['/ranking', 'app/ranking/page.tsx', 'rk', 'ranking'],
  ['/players/[id]', 'app/players/[id]/page.tsx', 'pp', 'player'],
  ['/athletes', 'app/athletes/page.tsx', 'at', 'athletes'],
])('%s on the light glass design', (_route, file, prefix, photo) => {
  const page = read(file)

  it('opts in with the glass scene over the blurred grass and loads the glass styles', () => {
    expect(page).toMatch(new RegExp(`<main className="bds-page ${prefix} gl gl-scene"`))
    expect(page).toMatch(/import '(\.\.\/)+glass\.css'/)
  })

  it('heads the page with its own licensed photo, not the old red glow', () => {
    expect(page).toContain(`glassSceneStyle(PAGE_PHOTOS.${photo})`)
    expect(page).not.toContain('ui-matchday')
  })
})

// The third view of the discover switch keeps its own header and honour cards; it opts in
// on its root and takes the stadium photo behind its head.
describe('/hall-of-fame on the light glass design', () => {
  const page = read('app/hall-of-fame/page.tsx')
  it('opts in with the glass scene and the stadium photo, and loads the glass styles', () => {
    expect(page).toContain('<main className="hall-page gl gl-scene"')
    expect(page).toContain('glassSceneStyle(PAGE_PHOTOS.hallOfFame)')
    expect(page).toContain("import '../glass.css'")
  })
})

// "ของฉัน" and its edit page follow /welcome onto the glass design (owner, 22 Oct 2026). The
// stylesheet's old rules stay for any page without `.gl`, so every glass rule is scoped.
describe('/profile on the light glass design', () => {
  const page = read('app/profile/page.tsx')
  const css = read('app/profile/profile.css')
  it('opts in with the glass scene and its own photo', () => {
    expect(page).toContain('<main className="pf gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.profile) as React.CSSProperties}>')
    expect(page).toContain("import '../glass.css'")
  })
  it('takes /profile/edit along, on its own photo, with every glass rule scoped to the opted-in root', () => {
    expect(read('app/profile/edit/page.tsx')).toContain('<main className="pf pf-editing gl gl-scene" style={glassSceneStyle(PAGE_PHOTOS.profileEdit) as React.CSSProperties}>')
    const glass = css.slice(css.indexOf('/* Light glass design (ADR-014)'))
    expect(glass.length).toBeGreaterThan(100)
    for (const rule of glass.split('}').map(part => part.trim()).filter(part => part && !part.startsWith('@') && !part.startsWith('/*'))) {
      expect(rule.replace(/\/\*[\s\S]*?\*\//g, '').split('{')[0].split(',').every(selector => selector.includes('.pf.gl')), rule).toBe(true)
    }
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
