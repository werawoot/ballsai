import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Before PageHeader there were nine hand-written top bars across 35 content pages, back
// buttons 15-17px tall labelled only "กลับ", one that called router.back(), and six pages
// with no header at all. These tests hold the seam.

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(`${root}${dir}`).flatMap(entry => {
    const path = `${dir}/${entry}`
    if (statSync(`${root}${path}`).isDirectory()) return walk(path)
    return path.endsWith('.tsx') ? [path] : []
  })

const CONTENT = walk('app').filter(path => !path.startsWith('app/admin') && !path.startsWith('app/api'))

// Pages that keep a header of their own on purpose.
const OWN_HEADER = new Set([
  'app/page.tsx', // home: AGENTS.md rule 7 protects its visual language
  'app/career/page.tsx', // designed identity headers
  'app/card/page.tsx',
  'app/hall-of-fame/page.tsx',
  'app/impact/page.tsx',
  'app/welcome/OnboardingFlow.tsx', // a task flow with its own single way forward
])

describe('one top bar for content pages', () => {
  it('leaves a hand-written <header> only where it is kept on purpose', () => {
    const offenders = CONTENT.filter(path => /<header\b/.test(read(path)) && !OWN_HEADER.has(path))
    expect(offenders).toEqual([])
  })

  it('is used on every page that used to write its own', () => {
    const users = CONTENT.filter(path => read(path).includes('<PageHeader'))
    expect(users.length).toBeGreaterThanOrEqual(27)
  })

  it.each([
    'app/team-members/page.tsx',
    'app/organization/invites/page.tsx',
    'app/venues/bookings/[bookingId]/page.tsx',
  ])('gives %s a header it did not have before', path => {
    expect(read(path)).toContain('<PageHeader back=')
  })
})

describe('back navigation', () => {
  const backs = CONTENT.flatMap(path =>
    [...read(path).matchAll(/<PageHeader back=\{\{ href: '([^']+)', label: '([^']+)' \}\}/g)]
      .map(match => ({ path, href: match[1], label: match[2] })),
  )

  it('found the back links to check', () => {
    expect(backs.length).toBeGreaterThanOrEqual(14)
  })

  it('goes to a page that exists, every time', () => {
    const missing = backs.filter(({ href }) => {
      const page = href === '/' ? 'app/page.tsx' : `app${href}/page.tsx`
      return !existsSync(`${root}${page}`)
    })
    expect(missing).toEqual([])
  })

  it('names the destination instead of the bare word "กลับ"', () => {
    expect(backs.filter(({ label }) => label.trim() === 'กลับ')).toEqual([])
  })

  it('never depends on browser history, which a shared link does not have', () => {
    for (const path of CONTENT) expect(read(path), path).not.toMatch(/router\.back\(\)|history\.back\(\)/)
  })

  it('keeps the visible label inside the accessible name (WCAG 2.5.3)', () => {
    const component = read('components/PageHeader.tsx')
    expect(component).toContain("aria-label={t('backTo', { label: back.label })}")
    expect(component).toContain('<span>{back.label}</span>')
    // Both languages keep the visible label inside the name.
    for (const locale of ['th', 'en']) {
      expect(JSON.parse(read(`messages/${locale}.json`)).header.backTo).toContain('{label}')
    }
  })
})

describe('touch targets and device edges', () => {
  const css = read('app/globals.css')
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`)
    expect(start, `${selector} must exist`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('}', start))
  }

  it('makes the logo and the back link at least 44px in both directions', () => {
    const shared = rule('.bds-page-header-brand, .bds-page-header-back')
    expect(shared).toContain('min-height:44px')
    expect(shared).toContain('min-width:44px')
  })

  it('gives every action link, the notification bell included, a 44px hit area', () => {
    expect(rule('.bds-page-header-actions > a')).toContain('min-height:44px')
  })

  it('stays clear of the notch now that the viewport is viewport-fit=cover', () => {
    const bar = rule('.bds-page-header')
    expect(bar).toContain('env(safe-area-inset-top)')
    expect(bar).toContain('env(safe-area-inset-left)')
    expect(bar).toContain('env(safe-area-inset-right)')
  })

  it('drops the wordmark, not an action, when a narrow phone runs out of room', () => {
    expect(css).toContain('@media (max-width:399px) { .bds-page-header.has-actions .bds-page-header-brand span { display:none; } }')
  })

  it('removed the styles that only the old headers used', () => {
    expect(css).not.toContain('header.bds-header')
  })
})
