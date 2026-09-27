import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// The four designed identity headers keep their own look (see PageHeader), but their links
// were 17-33px tall. An invisible pseudo-element grows only the area a finger can hit.

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')
const css = read('app/globals.css')

const LINKS: Record<string, string[]> = {
  'app/impact/page.tsx': ['impact-back', 'impact-logo', 'impact-directory'],
  'app/career/page.tsx': ['career-logo', 'career-hall-link', 'career-card-link'],
  'app/card/page.tsx': ['card-page-logo', 'card-page-profile-link'],
  'app/hall-of-fame/page.tsx': ['hall-logo', 'hall-ranking-link'],
}

const selectorList = (suffix: string) => {
  const rule = css.slice(0, css.indexOf(suffix === '' ? '{ position:relative; }' : '{ content:""; height:max(100%,44px)'))
  return rule.slice(rule.lastIndexOf('}') + 1)
}

describe('touch targets in the designed identity headers', () => {
  it.each(Object.entries(LINKS))('covers every header link on %s', (path, classes) => {
    const source = read(path)
    for (const name of classes) {
      expect(source, `${name} is still in the header`).toContain(`className="${name}"`)
      expect(selectorList(''), `${name} anchors its hit area`).toContain(`.${name}`)
      expect(selectorList('::before'), `${name} gets a hit area`).toContain(`.${name}::before`)
    }
  })

  it('makes the hit area at least 44px each way, centred, and invisible', () => {
    const start = css.indexOf('{ content:""; height:max(100%,44px)')
    const rule = css.slice(start, css.indexOf('}', start))
    expect(rule).toContain('height:max(100%,44px)')
    expect(rule).toContain('width:max(100%,44px)')
    expect(rule).toContain('transform:translate(-50%,-50%)')
    expect(rule).not.toMatch(/background|border|color|box-shadow/)
  })
})
