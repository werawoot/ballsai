import { useEffect, useState, useTransition } from 'react'
import { freshNavigation, goFresh, type Router } from '@/lib/fresh-navigation'

// The navigation after a write, with a fallback (owner, 14 and 15 Nov 2026). Next sometimes
// cancels it, or leaves it pending after its data has arrived, and the screen stays on the old
// page although the write has landed (docs/e2e.md: the goal step, and the schedule step 3 of 20
// runs). The navigation runs in a transition, so `navigating` is true while it is on its way. If
// the browser is still not on the destination 1.5 s after the navigation has ended, or 6 s after
// it started whatever its state, the destination is loaded in full. A slow phone under 6 s is
// never loaded twice; a stuck one waits about 6 s at most. On success the component usually
// unmounts, which clears the timers; if it stays, the check finds the browser already there.

export const FRESH_NAVIGATION_GRACE_MS = 1500
export const FRESH_NAVIGATION_CEILING_MS = 6000

type Pending = { href: string; how: 'replace' | 'push' }

// Load the destination in full unless the browser is already on it.
function arriveOrLoad({ href, how }: Pending) {
  if (freshNavigation(href, window.location.href) === 'refresh') return
  if (how === 'push') window.location.assign(href)
  else window.location.replace(href)
}

export function useFreshNavigation(router: Router) {
  const [pending, setPending] = useState<Pending | null>(null)
  const [navigating, startNavigation] = useTransition()
  useEffect(() => {
    if (!pending || navigating) return
    const timer = window.setTimeout(() => arriveOrLoad(pending), FRESH_NAVIGATION_GRACE_MS)
    return () => window.clearTimeout(timer)
  }, [pending, navigating])
  useEffect(() => {
    if (!pending) return
    const timer = window.setTimeout(() => arriveOrLoad(pending), FRESH_NAVIGATION_CEILING_MS)
    return () => window.clearTimeout(timer)
  }, [pending])

  // A refresh of the page already open has no destination to check; only a navigation is watched.
  const go = (href: string, how: 'replace' | 'push' = 'replace') => {
    const here = window.location.href
    if (freshNavigation(href, here) === 'navigate') setPending({ href: new URL(href, here).href, how })
    startNavigation(() => goFresh(router, href, how))
  }
  return { go, navigating }
}
