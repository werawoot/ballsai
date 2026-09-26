import Link from 'next/link'
import { DISCOVER_TABS } from '@/lib/site-nav'

type DiscoverHref = (typeof DISCOVER_TABS)[number]['href']

// นักกีฬา, Ranking and Hall of Fame used to be separate bottom tabs. They are three ways
// of looking at the same people, so they now share the "ค้นหา" tab and this switch keeps
// all three one tap apart. A server component: which view is current is known from the
// page that renders it, so no client JavaScript is needed to light it.
export default function DiscoverTabs({ current }: { current: DiscoverHref }) {
  return <nav className="bds-discover-tabs" aria-label="มุมมองการค้นหา">
    {DISCOVER_TABS.map(tab => {
      const isCurrent = tab.href === current
      return <Link
        key={tab.href}
        href={tab.href}
        className={`bds-discover-tab${isCurrent ? ' is-active' : ''}`}
        aria-current={isCurrent ? 'page' : undefined}
      >
        {tab.label}
      </Link>
    })}
  </nav>
}
