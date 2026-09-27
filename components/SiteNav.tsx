'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'
import { Bell, ClipboardList, House, Search, User, type LucideIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { fetchUnreadNotificationCount } from '@/lib/notification-count'
import { unreadBadge } from '@/lib/notification-unread'
import {
  NAV_ITEMS,
  NAV_PENDING_WATCHDOG_MS,
  abandonNavigation,
  activeNavItem,
  linkNavigationTarget,
  navigationPhase,
  showsSiteNav,
  startNavigation,
  type NavItemId,
  type NavPending,
} from '@/lib/site-nav'

// Rendered once, by the root layout, for every route that `showsSiteNav` allows. Pages
// must not render their own bottom bar; a test sweeps for that.

const ICONS: Record<NavItemId, LucideIcon> = {
  home: House,
  discover: Search,
  tournaments: ClipboardList,
  notifications: Bell,
  profile: User,
}

/** How long the progress bar takes to fill and fade once the new route has arrived. */
const FINISH_MS = 450

export default function SiteNav() {
  const pathname = usePathname() ?? '/'
  const t = useTranslations('nav')
  const visible = showsSiteNav(pathname)
  const [pending, setPending] = useState<NavPending>(null)
  const [unread, setUnread] = useState<number | null>(null)

  // Derived, not tracked: the tap is loading while we are still on the route it was made
  // from, and done the moment we are anywhere else.
  const phase = navigationPhase(pending, pathname)

  // Landed: let the bar complete and fade, then forget the tap.
  useEffect(() => {
    if (phase !== 'done') return
    const id = window.setTimeout(() => setPending(null), FINISH_MS)
    return () => window.clearTimeout(id)
  }, [phase])

  // Never landed -- the request failed, or the user went back first. Finish the bar as if
  // it had, because a loader that never ends is worse than none.
  useEffect(() => {
    if (phase !== 'loading') return
    const id = window.setTimeout(() => setPending(abandonNavigation), NAV_PENDING_WATCHDOG_MS)
    return () => window.clearTimeout(id)
  }, [phase, pending])

  // Every in-app link starts the same feedback as a tab, not only the five in the bar.
  // Listened for in the capture phase: next/link calls preventDefault() on each click it
  // routes itself, so by the bubble phase every in-app link would look already handled.
  useEffect(() => {
    if (!visible) return
    const onClick = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest('a') : null
      if (!(anchor instanceof HTMLAnchorElement)) return
      const destination = linkNavigationTarget(event, {
        href: anchor.getAttribute('href'),
        target: anchor.getAttribute('target'),
        download: anchor.hasAttribute('download'),
        noProgress: anchor.hasAttribute('data-no-progress'),
      }, window.location.href)
      if (destination === null) return
      const next = startNavigation(pathname, destination)
      if (next !== null) setPending(next)
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [pathname, visible])

  // The unread badge is read in the browser. Fetching it in the root layout would make
  // every page read cookies and so stop the statically rendered ones being static. The
  // session is read locally (no network) and RLS on `notifications` is the real guard;
  // this only decides whether to draw a number. It refreshes on each route change so
  // coming back from /notifications shows the new count.
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    const load = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getSession()
      const userId = data.session?.user.id
      const count = userId ? await fetchUnreadNotificationCount(supabase, userId) : null
      if (!cancelled) setUnread(count)
    }
    // A badge must never be the reason navigation breaks.
    load().catch(() => { if (!cancelled) setUnread(null) })
    return () => { cancelled = true }
  }, [pathname, visible])

  if (!visible) return null

  const active = activeNavItem(pathname)
  const badge = unreadBadge(unread)
  const loading = phase === 'loading'

  return <>
    <div className={`bds-route-progress${loading ? ' is-loading' : phase === 'done' ? ' is-done' : ''}`} aria-hidden="true" />
    {/* Holds the page's last line of content clear of the fixed bar, on exactly the routes
        that have one. It replaces the old blanket `body { padding-bottom: 80px }`. */}
    <div className="bds-nav-spacer" aria-hidden="true" />
    <nav className="bds-nav" aria-label={t('label')} aria-busy={loading}>
      {NAV_ITEMS.map(item => {
        const Icon = ICONS[item.id]
        const isActive = item.id === active
        const isPending = loading && pending?.href === item.href
        const itemBadge = item.id === 'notifications' ? badge : null
        return <Link
          key={item.id}
          href={item.href}
          className={`bds-nav-item${isActive ? ' is-active' : ''}${isPending ? ' is-pending' : ''}`}
          aria-current={isActive ? 'page' : undefined}
          aria-label={itemBadge ? `${t(`items.${item.id}`)} · ${t('unread', { count: unread ?? 0 })}` : undefined}
        >
          <span className="bds-nav-icon">
            <Icon size={21} strokeWidth={isActive ? 2.4 : 1.9} aria-hidden="true" />
            {itemBadge && <span className="bds-nav-badge" aria-hidden="true">{itemBadge.text}</span>}
          </span>
          <span className="bds-nav-label">{t(`items.${item.id}`)}</span>
        </Link>
      })}
    </nav>
    <span className="sr-only" role="status" aria-live="polite">{loading ? t('loading') : ''}</span>
  </>
}
