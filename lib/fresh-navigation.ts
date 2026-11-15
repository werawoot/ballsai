import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime'
import { announceNavigation } from '@/lib/site-nav'

// After a write, the page must show fresh data with ONE router call. router.replace() or push()
// followed at once by router.refresh() sends two requests that Next sometimes cancels both of,
// leaving old data on screen (docs/e2e.md, 14 Nov 2026). A navigation to another page already
// fetches that page fresh (dynamic pages, no client staleTimes); only the page already open
// needs refresh().

export type FreshNavigation = 'refresh' | 'navigate'

export function freshNavigation(href: string, here: string): FreshNavigation {
  const target = new URL(href, here)
  const current = new URL(here)
  return target.origin === current.origin && target.pathname === current.pathname && target.search === current.search ? 'refresh' : 'navigate'
}

export type Router = Pick<AppRouterInstance, 'refresh' | 'replace' | 'push'>

// Show `href` with fresh data: refresh when it is the page already open, else replace (or push).
export function navigateFresh(router: Router, href: string, how: 'replace' | 'push' = 'replace') {
  if (freshNavigation(href, window.location.href) === 'refresh') router.refresh()
  else router[how](href)
}

// The same, with the bar's progress line and live region (announceNavigation). Code that runs the
// navigation in a React transition announces before it and calls navigateFresh inside: a state
// update made inside a transition waits for the navigation to commit, so the line would only
// show once the new page was already there.
export function goFresh(router: Router, href: string, how: 'replace' | 'push' = 'replace') {
  announceNavigation(href)
  navigateFresh(router, href, how)
}
