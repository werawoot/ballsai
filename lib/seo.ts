// What search engines may see. BallDoenSai's users are minors, so the rule is the reverse of
// a normal site: only public, adult-facing pages are crawled and listed, and nothing that
// needs a sign-in is. app/robots.ts, app/sitemap.ts and next.config.mjs (X-Robots-Tag) all
// read these lists, so a new private area is added in one place.

// The address the site is served from. Set NEXT_PUBLIC_SITE_URL when the real domain is
// connected; until then the Vercel address.
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || 'https://ballsai-teal.vercel.app').replace(/\/+$/, '')
}

// Signed-in or personal areas: never crawled (robots.txt Disallow) and never indexed.
export const PRIVATE_PATHS = [
  '/admin', '/api', '/auth', '/bds-wallet', '/card', '/career', '/dashboard', '/guardian', '/login',
  '/match-plan', '/notifications', '/onboarding', '/organization', '/parent', '/profile',
  '/sponsor', '/team-members', '/venue', '/venues/bookings', '/welcome',
]

// Public pages that show young athletes' names. They stay open to people, but search engines
// are told not to index them (X-Robots-Tag: noindex) until the owner decides otherwise:
// a guardian agreeing to a public profile is not the same as agreeing to Google results.
// Crawling is allowed on purpose, so the noindex is seen and any old entry drops out.
export const NOINDEX_PATHS = ['/athletes', '/hall-of-fame', '/players', '/ranking', '/scout']

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`)

export const isPrivatePath = (path: string) => PRIVATE_PATHS.some(base => under(path, base))
export const isNoindexPath = (path: string) => NOINDEX_PATHS.some(base => under(path, base))

// Public, adult-facing pages worth listing. Tournament pages follow from the database.
const STATIC_PUBLIC = ['/', '/tournaments', '/venues', '/training', '/impact', '/privacy', '/terms']

export type SitemapEntry = { url: string; changeFrequency?: 'daily' | 'weekly' | 'monthly'; priority?: number }

export function sitemapEntries(tournamentIds: string[]): SitemapEntry[] {
  const base = siteUrl()
  return [
    ...STATIC_PUBLIC.map(path => ({ url: `${base}${path}`, changeFrequency: path === '/' || path === '/tournaments' ? 'daily' as const : 'weekly' as const, priority: path === '/' ? 1 : 0.7 })),
    ...tournamentIds.map(id => ({ url: `${base}/tournaments/${encodeURIComponent(id)}`, changeFrequency: 'daily' as const, priority: 0.8 })),
  ].filter(entry => { const path = new URL(entry.url).pathname; return !isPrivatePath(path) && !isNoindexPath(path) })
}

// The X-Robots-Tag a response gets (middleware.ts), or null for a page that may be indexed.
export function robotsHeader(path: string): string | null {
  if (isPrivatePath(path)) return 'noindex, nofollow'
  if (isNoindexPath(path)) return 'noindex'
  return null
}
