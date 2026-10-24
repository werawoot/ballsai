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
