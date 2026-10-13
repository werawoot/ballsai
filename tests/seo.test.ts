import { describe, expect, it } from 'vitest'
import { PRIVATE_PATHS, NOINDEX_PATHS, isPrivatePath, isNoindexPath, robotsHeader, siteUrl, sitemapEntries } from '@/lib/seo'
import robots from '@/app/robots'

describe('SEO: Google sees only what should be seen (users are minors)', () => {
  it('keeps every signed-in page out of crawling', () => {
    for (const path of ['/profile', '/profile/edit', '/team-members', '/team-members/abc', '/notifications', '/guardian', '/parent',
      '/dashboard', '/dashboard/results', '/admin', '/admin/moderation', '/api/notifications', '/card', '/career', '/welcome',
      '/login', '/match-plan', '/organization', '/venue', '/sponsor', '/venues/bookings', '/bds-wallet', '/onboarding']) {
      expect(isPrivatePath(path), path).toBe(true)
    }
  })

  it('lets public pages be crawled, and never mistakes a prefix for a match', () => {
    for (const path of ['/', '/tournaments', '/tournaments/abc', '/venues', '/venues/abc', '/privacy', '/terms', '/impact', '/training', '/cardigan', '/venue-guide']) {
      expect(isPrivatePath(path), path).toBe(false)
    }
  })

  it('does not index pages that name young athletes until the owner decides', () => {
    for (const path of ['/players/p-1', '/athletes', '/ranking', '/hall-of-fame', '/scout']) {
      expect(isNoindexPath(path), path).toBe(true)
      expect(isPrivatePath(path), path).toBe(false)
    }
    expect(isNoindexPath('/tournaments')).toBe(false)
  })

  it('robots.txt disallows the private paths and points at the sitemap', () => {
    const rules = robots()
    const rule = Array.isArray(rules.rules) ? rules.rules[0] : rules.rules
    expect(rule.allow).toBe('/')
    expect(rule.disallow).toEqual(PRIVATE_PATHS.map(path => `${path}`))
    expect(rules.sitemap).toBe(`${siteUrl()}/sitemap.xml`)
  })

  it('the sitemap lists public pages and tournaments only, never a private or no-index page', () => {
    const entries = sitemapEntries(['t-1', 't-2'])
    const paths = entries.map(entry => new URL(entry.url).pathname)
    expect(paths).toContain('/')
    expect(paths).toContain('/tournaments/t-1')
    expect(paths).toContain('/tournaments/t-2')
    for (const path of paths) {
      expect(isPrivatePath(path), path).toBe(false)
      expect(isNoindexPath(path), path).toBe(false)
    }
    expect(NOINDEX_PATHS.length).toBeGreaterThan(0)
  })

  it('tells search engines not to index private and athlete-naming pages, and says nothing on public ones', () => {
    expect(robotsHeader('/profile')).toBe('noindex, nofollow')
    expect(robotsHeader('/players/p-1')).toBe('noindex')
    expect(robotsHeader('/tournaments/t-1')).toBeNull()
    expect(robotsHeader('/')).toBeNull()
  })
})
