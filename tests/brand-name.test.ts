import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Owner, 24 Oct 2026: the product is DOENSAI.com (ADR-014, decision ก2), in every name and
// logo the app shows. Left as they are, on purpose: the terms and privacy pages (under legal
// review, T25), guardian consent and privacy wording (never edited without the owner),
// e-mail and rate-limit internals, demo data and production host names.
const KEEP = new Set([
  'app/terms/page.tsx',
  'app/privacy/page.tsx',
  'app/guardian/GuardianLinksClient.tsx',
  'app/sponsorships/SponsorshipsClient.tsx',
  'lib/email.ts',
  'lib/rate-limit.ts',
  'lib/seo.ts',
  'lib/sample-data.ts',
])
const OLD = /BallDoenSai|BALLDOENSAI|balldoensai/

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|json)$/.test(name) ? [path] : []
  })
}

describe('the product name', () => {
  it('reads DOENSAI.com wherever the app shows it', () => {
    const left = ['app', 'components', 'lib', 'content']
      .flatMap(files)
      .filter(path => !KEEP.has(path) && OLD.test(readFileSync(path, 'utf8')))
    expect(left).toEqual([])
  })

  it('keeps the old name only in the guardian invite line of the messages', () => {
    for (const locale of ['th', 'en']) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'))
      const without = JSON.stringify({ ...messages, profileHome: { ...messages.profileHome, guardianInvite: {} } })
      expect(without).not.toMatch(OLD)
    }
  })

  it('names the site DOENSAI.com in the page title', () => {
    expect(JSON.parse(readFileSync('messages/th.json', 'utf8')).meta.title).toMatch(/^DOENSAI\.com/)
  })
})

describe('the brand mark', () => {
  it("is the owner's DOENSAI logo, not the old red trophy square", () => {
    const mark = readFileSync('components/BrandMark.tsx', 'utf8')
    expect(mark).toContain('/brand/doensai-mark.webp')
    expect(mark).not.toContain('Trophy')
    expect(statSync('public/brand/doensai-mark.webp').size).toBeGreaterThan(0)
    expect(readFileSync('app/ui.css', 'utf8')).not.toMatch(/\.bds-brand-mark \{[^}]*--ui-red-hot/)
  })

  it('is the site icon in the browser tab and on a phone home screen', () => {
    expect(statSync('app/icon.png').size).toBeGreaterThan(0)
    expect(statSync('app/apple-icon.png').size).toBeGreaterThan(0)
    // The .ico is the owner's logo too: a PNG-in-ICO whose first image starts with the PNG signature.
    const ico = readFileSync('app/favicon.ico')
    expect(ico.readUInt16LE(2)).toBe(1)
    const first = ico.readUInt32LE(18)
    expect([...ico.subarray(first, first + 4)]).toEqual([0x89, 0x50, 0x4e, 0x47])
  })

  it('stands on every page that shows the brand, the impact page included', () => {
    expect(readFileSync('app/impact/page.tsx', 'utf8')).toContain('<BrandMark')
  })
})
