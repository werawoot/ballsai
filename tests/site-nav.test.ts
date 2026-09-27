import { readdirSync, readFileSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DISCOVER_TABS,
  MAX_NAV_ITEMS,
  NAV_ITEMS,
  PROFILE_MENU,
  abandonNavigation,
  activeNavItem,
  isCurrentDestination,
  isPlainPrimaryClick,
  isWithin,
  linkNavigationTarget,
  navigationPhase,
  showsSiteNav,
  startNavigation,
} from '@/lib/site-nav'

const root = fileURLToPath(new URL('../', import.meta.url))
const read = (path: string) => readFileSync(`${root}${path}`, 'utf8')
const walk = (dir: string): string[] =>
  readdirSync(`${root}${dir}`).flatMap(entry => {
    const path = `${dir}/${entry}`
    if (statSync(`${root}${path}`).isDirectory()) return walk(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })

// The nine destinations the old SiteNav carried. Collapsing the bar must not delete one.
const FORMER_DESTINATIONS = [
  '/', '/athletes', '/ranking', '/tournaments', '/venues',
  '/sponsorships', '/profile', '/notifications', '/team-members',
]

describe('the bar itself', () => {
  it('holds to the five-destination ceiling both platform guides set', () => {
    expect(MAX_NAV_ITEMS).toBe(5)
    expect(NAV_ITEMS.length).toBeLessThanOrEqual(MAX_NAV_ITEMS)
  })

  it('never repeats a tab or a destination', () => {
    expect(new Set(NAV_ITEMS.map(item => item.id)).size).toBe(NAV_ITEMS.length)
    expect(new Set(NAV_ITEMS.map(item => item.href)).size).toBe(NAV_ITEMS.length)
  })

  it('keeps every former destination one tap away from somewhere', () => {
    const reachable = new Set<string>([
      ...NAV_ITEMS.map(item => item.href),
      ...DISCOVER_TABS.map(tab => tab.href),
      ...PROFILE_MENU.map(item => item.href),
    ])
    expect(FORMER_DESTINATIONS.filter(href => !reachable.has(href))).toEqual([])
  })

  it('lights its own tab for every destination it moved elsewhere', () => {
    // Moved into the Discover switch -> Discover stays lit; moved into Profile -> Profile.
    for (const tab of DISCOVER_TABS) expect(activeNavItem(tab.href)).toBe('discover')
    for (const item of PROFILE_MENU) expect(activeNavItem(item.href)).toBe('profile')
  })
})

describe('which tab is lit', () => {
  it.each([
    ['/', 'home'],
    ['/athletes', 'discover'],
    ['/ranking', 'discover'],
    ['/hall-of-fame', 'discover'],
    ['/players/7f6c', 'discover'],
    ['/scout', 'discover'],
    ['/tournaments', 'tournaments'],
    ['/tournaments/abc', 'tournaments'],
    ['/tournaments/abc/register', 'tournaments'],
    ['/notifications', 'notifications'],
    ['/profile', 'profile'],
    ['/career', 'profile'],
    ['/card', 'profile'],
    ['/team-members', 'profile'],
    ['/venues', 'profile'],
    ['/venues/bookings/xyz', 'profile'],
    ['/venue', 'profile'],
    ['/sponsor', 'profile'],
    ['/sponsorships', 'profile'],
    ['/dashboard/results', 'profile'],
  ] as const)('%s lights %s', (pathname, expected) => {
    expect(activeNavItem(pathname)).toBe(expected)
  })

  it('lights nothing on pages outside every tab rather than claiming a false location', () => {
    expect(activeNavItem('/terms')).toBeNull()
    expect(activeNavItem('/privacy')).toBeNull()
    expect(activeNavItem('/impact')).toBeNull()
  })

  it('matches by path segment, so a shared prefix cannot light the wrong tab', () => {
    expect(isWithin('/venues', '/venue')).toBe(false)
    expect(isWithin('/venue/x', '/venue')).toBe(true)
    expect(isWithin('/sponsorships', '/sponsor')).toBe(false)
    expect(isWithin('/playersx', '/players')).toBe(false)
    expect(activeNavItem('/playersx')).toBeNull()
  })

  it('treats "/" as exactly the home page, not a prefix of everything', () => {
    expect(isWithin('/', '/')).toBe(true)
    expect(isWithin('/athletes', '/')).toBe(false)
  })
})

describe('where the bar appears', () => {
  it('stays out of sign-in, onboarding and the admin workspace', () => {
    for (const pathname of ['/login', '/welcome', '/admin', '/admin/moderation', '/admin/venue-photos']) {
      expect(showsSiteNav(pathname)).toBe(false)
    }
  })

  it('appears on the pages that used to have no bar at all', () => {
    for (const pathname of ['/', '/players/1', '/dashboard', '/venues/bookings', '/guardian', '/notifications', '/card', '/terms']) {
      expect(showsSiteNav(pathname)).toBe(true)
    }
  })

  it('does not hide on routes that merely start with a hidden name', () => {
    expect(showsSiteNav('/administrator')).toBe(true)
    expect(showsSiteNav('/welcome-pack')).toBe(true)
  })
})

describe('the loading feedback a tap starts', () => {
  it('does not start when the tap is for the page already showing', () => {
    // No navigation will happen, so nothing would ever finish the loader.
    expect(isCurrentDestination('/athletes', '/athletes')).toBe(true)
    expect(startNavigation('/athletes', '/athletes')).toBeNull()
  })

  it('does start for a tab whose own page is not the one showing', () => {
    // On /career the Profile tab is lit, but tapping it still goes to /profile.
    expect(startNavigation('/career', '/profile')).toEqual({ href: '/profile', from: '/career' })
  })

  it('is loading while the route has not moved, and done the moment it has', () => {
    const pending = startNavigation('/', '/tournaments')

    expect(navigationPhase(pending, '/')).toBe('loading')
    expect(navigationPhase(pending, '/tournaments')).toBe('done')
  })

  it('counts landing somewhere else as done too', () => {
    // A redirect (e.g. /profile -> /login) or a newer tap replaced the destination.
    const pending = startNavigation('/', '/profile')

    expect(navigationPhase(pending, '/login')).toBe('done')
  })

  it('is idle with nothing pending', () => {
    expect(navigationPhase(null, '/anything')).toBe('idle')
  })

  it('finishes instead of freezing when the watchdog gives up', () => {
    const pending = startNavigation('/', '/tournaments')
    const abandoned = abandonNavigation(pending)

    // Still on "/" -- the navigation never landed -- yet the bar is told to finish.
    expect(navigationPhase(abandoned, '/')).toBe('done')
    expect(abandonNavigation(null)).toBeNull()
  })

  it('lets a second tap replace the first', () => {
    const first = startNavigation('/', '/tournaments')
    const second = startNavigation('/', '/notifications')

    expect(navigationPhase(second, '/')).toBe('loading')
    expect(second?.href).toBe('/notifications')
    expect(first?.href).toBe('/tournaments')
  })

  it('ignores clicks that open a new tab or window', () => {
    const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }

    expect(isPlainPrimaryClick(plain)).toBe(true)
    expect(isPlainPrimaryClick({ ...plain, metaKey: true })).toBe(false)
    expect(isPlainPrimaryClick({ ...plain, ctrlKey: true })).toBe(false)
    expect(isPlainPrimaryClick({ ...plain, shiftKey: true })).toBe(false)
    expect(isPlainPrimaryClick({ ...plain, altKey: true })).toBe(false)
    expect(isPlainPrimaryClick({ ...plain, button: 1 })).toBe(false)
    expect(isPlainPrimaryClick({ ...plain, defaultPrevented: true })).toBe(false)
  })
})

describe('the loading feedback any in-app link starts', () => {
  const here = 'http://localhost:3108/tournaments?view=open'
  const plain = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false }
  const link = (href: string | null, extra: { target?: string | null; download?: boolean } = {}) =>
    ({ href, target: extra.target ?? null, download: extra.download ?? false })

  it('starts for a plain click on a link to another page of the app', () => {
    expect(linkNavigationTarget(plain, link('/athletes'), here)).toBe('/athletes')
    expect(linkNavigationTarget(plain, link('/tournaments/abc'), here)).toBe('/tournaments/abc')
    expect(linkNavigationTarget(plain, link('http://localhost:3108/ranking?view=trending'), here)).toBe('/ranking')
    expect(linkNavigationTarget(plain, link('abc'), here)).toBe('/abc')
    expect(linkNavigationTarget(plain, link('/players/1', { target: '_self' }), here)).toBe('/players/1')
  })

  it.each([
    ['meta (cmd)', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
  ] as const)('does not start with %s held', (_name, modifier) => {
    expect(linkNavigationTarget({ ...plain, ...modifier }, link('/athletes'), here)).toBeNull()
  })

  it('does not start on a middle or right click', () => {
    expect(linkNavigationTarget({ ...plain, button: 1 }, link('/athletes'), here)).toBeNull()
    expect(linkNavigationTarget({ ...plain, button: 2 }, link('/athletes'), here)).toBeNull()
  })

  it('does not start for a click something else already cancelled', () => {
    expect(linkNavigationTarget({ ...plain, defaultPrevented: true }, link('/athletes'), here)).toBeNull()
  })

  it('does not start for a link that opens in another tab or frame', () => {
    expect(linkNavigationTarget(plain, link('/athletes', { target: '_blank' }), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('/athletes', { target: '_BLANK' }), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('/athletes', { target: 'preview' }), here)).toBeNull()
  })

  it('does not start for a download', () => {
    expect(linkNavigationTarget(plain, link('/card/export.png', { download: true }), here)).toBeNull()
  })

  it('does not start for a link that leaves the app', () => {
    expect(linkNavigationTarget(plain, link('https://www.facebook.com/'), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('//evil.example/athletes'), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('https://localhost:3108/athletes'), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('mailto:hello@example.com'), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('tel:0812345678'), here)).toBeNull()
  })

  it('does not start for a jump within the page', () => {
    expect(linkNavigationTarget(plain, link('#rules'), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('/tournaments?view=open#rules'), here)).toBeNull()
  })

  it('does not start for a link to the page already showing', () => {
    expect(linkNavigationTarget(plain, link('/tournaments?view=open'), here)).toBeNull()
    expect(linkNavigationTarget(plain, link('/tournaments'), here)).toBeNull()
    // Query-only change: the pathname never moves, so nothing would ever finish the bar.
    expect(linkNavigationTarget(plain, link('/tournaments?view=closed'), here)).toBeNull()
  })

  it('does not start for an anchor with no href', () => {
    expect(linkNavigationTarget(plain, link(null), here)).toBeNull()
  })

  it('is wired to every link on the page, ahead of next/link cancelling the click', () => {
    const nav = read('components/SiteNav.tsx')
    expect(nav).toContain("document.addEventListener('click', onClick, true)")
    expect(nav).toContain("document.removeEventListener('click', onClick, true)")
    expect(nav).toContain('linkNavigationTarget(event,')
    // One way in: the tabs no longer carry a second, separate click handler.
    expect(nav).not.toContain('onClick={')
  })
})

describe('one bar, rendered in one place', () => {
  const sources = walk('app').filter(path => !path.startsWith('app/admin') && !path.startsWith('app/api'))

  it('is mounted by the root layout exactly once', () => {
    const layout = read('app/layout.tsx')
    expect(layout.match(/<SiteNav \/>/g)?.length).toBe(1)
  })

  it('is not imported by any page any more', () => {
    const offenders = sources.filter(path => path !== 'app/layout.tsx' && read(path).includes("from '@/components/SiteNav'"))
    expect(offenders).toEqual([])
  })

  it('has no page drawing a bottom bar of its own', () => {
    // The four copies were all `position: fixed` at `bottom: 0` with nav links inside.
    const offenders = sources.filter(path => {
      const source = read(path)
      return /<nav[^>]*position:\s*'fixed'[^>]*bottom:\s*0/.test(source) || source.includes('home-nav')
    })
    expect(offenders).toEqual([])
  })

  it('draws the relocated destinations on the profile page', () => {
    const profile = read('app/profile/page.tsx')
    expect(profile).toContain('PROFILE_MENU.map(')
    expect(profile).toContain('PROFILE_MENU_ICONS[item.href]')
  })

  it.each(DISCOVER_TABS.map(tab => [tab.href]))('offers the discover switch on %s, lit correctly', href => {
    const file = href === '/athletes' ? 'app/athletes/page.tsx' : href === '/ranking' ? 'app/ranking/page.tsx' : 'app/hall-of-fame/page.tsx'
    expect(read(file)).toContain(`<DiscoverTabs current="${href}" />`)
  })
})

describe('the styles that make it fit', () => {
  const css = read('app/globals.css')
  const rule = (selector: string) => {
    const start = css.indexOf(`${selector} {`)
    expect(start, `${selector} must exist`).toBeGreaterThan(-1)
    return css.slice(start, css.indexOf('}', start))
  }

  it('lays five equal columns, so there is no content width to overflow', () => {
    expect(rule('.bds-nav')).toContain('grid-template-columns:repeat(5,minmax(0,1fr))')
    expect(rule('.bds-nav-item')).toContain('min-width:0')
  })

  it('reserves exactly the height the bar takes, from one shared value', () => {
    // They used to be two numbers (a 66px bar, a 64px spacer) and the last 2px of every
    // page slid under the bar.
    expect(rule('.bds-nav')).toContain('height:calc(var(--nav-height) + env(safe-area-inset-bottom))')
    expect(rule('.bds-nav')).toContain('box-sizing:border-box')
    expect(rule('.bds-nav-spacer')).toContain('height:calc(var(--nav-height) + env(safe-area-inset-bottom))')
  })

  it('sits above the iPhone home indicator', () => {
    expect(rule('.bds-nav')).toContain('env(safe-area-inset-bottom)')
    expect(rule('.bds-nav-spacer')).toContain('env(safe-area-inset-bottom)')
    expect(read('app/layout.tsx')).toContain("viewportFit: 'cover'")
  })

  it('gives every tab at least a 48px touch target and a readable label', () => {
    const item = rule('.bds-nav-item')
    expect(Number(item.match(/min-height:(\d+)px/)?.[1])).toBeGreaterThanOrEqual(48)
    expect(Number(item.match(/font:\d+ (\d+)px/)?.[1])).toBeGreaterThanOrEqual(12)
  })

  it('never truncates a label on a 320px screen, stepping down one size instead', () => {
    // Measured in a browser at 320px: "รายการแข่ง" needed 58.3px of 57.6px at 12px.
    const narrow = css.slice(css.indexOf('@media (max-width:359px)'), css.indexOf('}', css.indexOf('.bds-nav-label', css.indexOf('@media (max-width:359px)'))) + 1)
    expect(narrow).toContain('.bds-nav { padding-left:2px; padding-right:2px; }')
    expect(Number(narrow.match(/\.bds-nav-label \{ font-size:(\d+)px/)?.[1])).toBe(11)
  })

  it('gives the discover switch at least Apple\'s 44pt minimum touch target', () => {
    expect(Number(rule('.bds-discover-tab').match(/min-height:(\d+)px/)?.[1])).toBeGreaterThanOrEqual(44)
  })

  it('no longer reserves space on every page for a bar that may not be there', () => {
    const body = css.slice(css.indexOf('body {'), css.indexOf('}', css.indexOf('body {')))
    expect(body).not.toContain('padding-bottom')
  })

  it('calms every animation for people who ask for less motion', () => {
    const reduced = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce) {\n  .bds-route-progress'))
    expect(reduced).toContain('.bds-route-progress.is-loading { animation:none')
    expect(reduced).toContain('.bds-nav-item.is-pending .bds-nav-icon::after { animation:none')
    expect(reduced).toContain('.bds-skel-line, .bds-skel-avatar, .bds-skel-stat, .bds-skel-card { animation:none')
  })
})

describe('the route skeleton', () => {
  const loading = read('app/loading.tsx')

  it('announces itself to screen readers rather than showing silent grey boxes', () => {
    expect(loading).toContain('role="status"')
    expect(loading).toContain('กำลังโหลดหน้า…')
  })

  it('hides its decorative shapes from assistive technology', () => {
    expect(loading.match(/aria-hidden="true"/g)?.length).toBeGreaterThanOrEqual(3)
  })
})
