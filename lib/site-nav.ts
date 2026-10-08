// The one bottom navigation for the whole app, and the rules that decide what it shows.
//
// There used to be four separate bottom bars -- a 9-item `SiteNav` on seven pages, a
// light 5-item bar hand-written into the home page, and two more inline copies in
// `/dashboard` and `/players/[id]` -- plus 36 pages with none at all. They disagreed on
// items, order, colour and height, and the 9-item one could not fit a phone: nine
// 64px-minimum items need 576px, a 375px screen has 375, and a fixed bar cannot scroll,
// so the last few destinations were simply unreachable on mobile.
//
// Both platform guides cap a bottom bar at five destinations (Apple HIG tab bars,
// Material 3 navigation bar: "3-5"). The four that no longer fit are reached from the
// Profile tab instead; see `PROFILE_MENU`.
//
// Kept free of React so every rule here can be tested directly.

export type NavItemId = 'home' | 'discover' | 'tournaments' | 'notifications' | 'profile'

export type NavItem = {
  id: NavItemId
  href: string
  // The visible name is not here: it is `nav.items.<id>` in messages/*.json.
  /**
   * Route prefixes that belong to this tab. A page reached from inside a tab keeps that
   * tab lit, so the scout always knows where they are and one tap takes them back.
   */
  owns: readonly string[]
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'home', href: '/', owns: [] },
  { id: 'discover', href: '/athletes', owns: ['/athletes', '/ranking', '/hall-of-fame', '/players', '/scout'] },
  { id: 'tournaments', href: '/tournaments', owns: ['/tournaments'] },
  { id: 'notifications', href: '/notifications', owns: ['/notifications'] },
  {
    id: 'profile',
    href: '/profile',
    owns: [
      '/profile', '/career', '/card', '/team-members', '/guardian', '/organization',
      '/venues', '/venue', '/sponsorships', '/sponsor', '/match-plan', '/bds-wallet', '/dashboard',
    ],
  },
] as const

/** The platform ceiling. A test holds the list to it so a sixth tab cannot creep back in. */
export const MAX_NAV_ITEMS = 5

/**
 * Where the destinations that left the bar now live. Each one must stay reachable in one
 * tap from the Profile tab, or removing it from the bar would have deleted it.
 */
export const PROFILE_MENU = [
  { href: '/venues', label: 'จองสนาม', hint: 'หาสนามและดูคำขอจองของทีม' },
  { href: '/sponsorships', label: 'โอกาสสนับสนุน', hint: 'ทุนและโอกาสจากแบรนด์ที่เปิดรับ' },
  { href: '/team-members', label: 'สมาชิกทีม', hint: 'คำเชิญเข้าทีมและรายชื่อทีมของฉัน' },
  { href: '/career', label: 'ประวัติการเล่นของฉัน', hint: 'เส้นทางและผลงานที่ยืนยันแล้ว' },
] as const

/** The three views that used to be separate tabs, now one tab with a switch inside. */
export const DISCOVER_TABS = [
  { href: '/athletes', label: 'นักกีฬา' },
  { href: '/ranking', label: 'อันดับ' },
  { href: '/hall-of-fame', label: 'หอเกียรติยศ' },
] as const

/**
 * Routes that are not places to navigate between. Sign-in and onboarding are task flows
 * with their own single way forward, and `/admin` is a separate workspace with its own
 * navigation shell; a consumer tab bar on top of either would be a second, competing exit.
 */
const HIDDEN_ON = ['/login', '/welcome', '/admin'] as const

/** Segment-aware prefix match: `/venue` owns `/venue/x` but not `/venues`. */
export function isWithin(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/'
  return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function showsSiteNav(pathname: string): boolean {
  return !HIDDEN_ON.some(prefix => isWithin(pathname, prefix))
}

/**
 * The tab to light for a route. `null` for pages that sit outside every tab -- terms,
 * privacy -- where lighting one would claim a location the user is not in.
 */
export function activeNavItem(pathname: string): NavItemId | null {
  if (pathname === '/') return 'home'
  // Longest matching prefix wins, so a more specific owner can never be shadowed.
  let best: { id: NavItemId; length: number } | null = null
  for (const item of NAV_ITEMS) {
    for (const prefix of item.owns) {
      if (isWithin(pathname, prefix) && (best === null || prefix.length > best.length)) {
        best = { id: item.id, length: prefix.length }
      }
    }
  }
  return best?.id ?? null
}

/**
 * Whether tapping `href` from `pathname` actually goes somewhere. Tapping the tab you are
 * already on must not start a loading indicator that no navigation will ever finish.
 */
export function isCurrentDestination(pathname: string, href: string): boolean {
  return pathname === href
}

// --- Navigation feedback -------------------------------------------------------------
//
// A tap must answer immediately, before the next page has rendered anything. The bar
// holds the tapped destination until the route changes -- any change, because a route
// that moved has either landed where we asked or been replaced by somewhere newer. If it
// never changes -- the request failed, or the user went back before it landed -- the
// watchdog clears it, because a loading indicator that never ends is worse than none.

/**
 * A tap in flight: where it is going, and the route it was made FROM. `from` is what
 * lets the phase be derived rather than tracked -- the moment the route is no longer
 * `from`, the navigation has landed, with no effect needed to notice. `null` means the
 * watchdog gave up on it.
 */
export type NavPending = { href: string; from: string | null } | null

export type NavPhase = 'idle' | 'loading' | 'done'

/** Long enough that a slow server render is not cut short on a phone. */
export const NAV_PENDING_WATCHDOG_MS = 12_000

export function startNavigation(pathname: string, href: string): NavPending {
  return isCurrentDestination(pathname, href) ? null : { href, from: pathname }
}

/**
 * `loading` while we are still on the route the tap was made from; `done` once we are
 * anywhere else -- landed where asked, or replaced by somewhere newer -- so the bar can
 * finish and fade; `idle` when nothing is pending.
 */
export function navigationPhase(pending: NavPending, pathname: string): NavPhase {
  if (pending === null) return 'idle'
  return pending.from === pathname ? 'loading' : 'done'
}

/** The watchdog's way out: finish the bar as if it landed, rather than freeze it. */
export function abandonNavigation(pending: NavPending): NavPending {
  return pending === null ? null : { ...pending, from: null }
}

/**
 * Whether a click should start the loading feedback at all. A modified or non-primary
 * click opens a new tab or window and leaves this page exactly where it is, so showing a
 * loader here would announce a navigation that is happening somewhere else.
 */
export function isPlainPrimaryClick(event: {
  button: number
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  defaultPrevented: boolean
}): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented
}

/** The parts of an `<a>` that decide whether following it leaves this page in this tab. */
export type LinkAttributes = {
  /** The raw `href` attribute, resolved against `current` here. */
  href: string | null
  target: string | null
  download: boolean
  /**
   * `data-no-progress` on the `<a>`: the way out for a link whose own handler may keep the
   * user on this page (a confirm, a client-side action). Without it the bar would run
   * until the watchdog, 12 seconds, announcing a navigation that never started.
   */
  noProgress: boolean
}

/**
 * The route a click on an in-app link is about to load, or `null` when the loading bar
 * must stay still. The bottom bar and every other link on the page share this rule, so a
 * tap anywhere answers the same way.
 *
 * It stays still whenever this tab will not render a new route: a modified or middle
 * click, `target="_blank"` (or any named target), `download`, another origin (including
 * `mailto:` and `tel:`), and any link to the path already showing -- a hash jump, the same
 * page, or the same page with a new query. The last is a deliberate gap: the phase is
 * derived from the pathname alone, so a query-only change would never be seen to land and
 * would sit in `loading` until the watchdog.
 */
export function linkNavigationTarget(
  click: Parameters<typeof isPlainPrimaryClick>[0],
  link: LinkAttributes,
  current: string,
): string | null {
  if (!isPlainPrimaryClick(click)) return null
  if (link.href === null || link.download || link.noProgress) return null
  if (link.target && link.target.toLowerCase() !== '_self') return null
  let from: URL
  let to: URL
  try {
    from = new URL(current)
    to = new URL(link.href, from)
  } catch {
    return null
  }
  if (to.origin !== from.origin) return null
  if (to.pathname === from.pathname) return null
  return to.pathname
}
