import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// At 320px /scout was 394px wide: the shortlist column kept its 260px floor at every width,
// the talent list got 12px, and the filter row spilled out of it. Measured in a browser.

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')
const css = read('app/globals.css')
const client = read('app/scout/ScoutClient.tsx')
const media = (query: string) => {
  const start = css.indexOf(`@media (${query}) { .scout-`)
  expect(start, `${query} must exist`).toBeGreaterThan(-1)
  return css.slice(start, css.indexOf('\n', start))
}

describe('/scout on a phone', () => {
  it('takes its column tracks from CSS, where they can change with the width', () => {
    expect(client).toContain('className="scout-layout"')
    expect(client).toContain('className="scout-filters"')
    expect(client).not.toContain('gridTemplateColumns')
  })

  it('stacks the shortlist under the list instead of beside it', () => {
    expect(media('max-width:720px')).toContain('.scout-layout { grid-template-columns:minmax(0,1fr); }')
  })

  it('puts the filters two to a row, search on its own, and lets every one shrink', () => {
    const narrow = media('max-width:560px')
    expect(narrow).toContain('.scout-filters { grid-template-columns:repeat(2,minmax(0,1fr)); }')
    expect(narrow).toContain('.scout-filter-search { grid-column:1 / -1; }')
    expect(css).toContain('.scout-filters > * { min-width:0; }')
    expect(css).toContain('.scout-filters select { box-sizing:border-box; width:100%; }')
    expect(client).toContain('<section style={{ minWidth: 0 }}>')
  })

  it('keeps the wide layout unchanged', () => {
    expect(css).toContain('.scout-layout { display:grid; gap:16px; grid-template-columns:minmax(0,1fr) minmax(260px,.34fr); }')
    expect(css).toContain('.scout-filters { display:grid; gap:7px; grid-template-columns:1.4fr repeat(3,1fr); }')
  })

  it('gives every field at least a 44px touch target', () => {
    expect(Number(client.match(/minHeight: (\d+)/)?.[1])).toBeGreaterThanOrEqual(44)
  })
})
