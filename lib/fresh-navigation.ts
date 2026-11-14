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

type Router = { refresh(): void; replace(href: string): void; push(href: string): void }

// Show `href` with fresh data: refresh when it is the page already open, else replace (or push).
export function goFresh(router: Router, href: string, how: 'replace' | 'push' = 'replace') {
  if (freshNavigation(href, window.location.href) === 'refresh') router.refresh()
  else router[how](href)
}
