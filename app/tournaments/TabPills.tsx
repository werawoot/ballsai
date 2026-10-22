'use client'

import Link from 'next/link'
import { useLayoutEffect, useRef, useState } from 'react'

// The tournament tabs with one green pill that slides to the tab you pick. The pill moves
// on the click, before the new list arrives, so the choice shows at once; the page then
// re-renders the same component and the pill is already in place. Each tab is a plain
// link, so the tabs work without JavaScript too.
export default function TabPills({ label, items }: { label: string; items: Array<{ href: string; text: string; active: boolean }> }) {
  const nav = useRef<HTMLElement>(null)
  const pill = useRef<HTMLSpanElement>(null)
  const current = Math.max(0, items.findIndex(item => item.active))
  const [clicked, setClicked] = useState<{ index: number; from: number } | null>(null)
  // A click shows at once; once the page has moved on (or come back with the back
  // button), the active tab from the server wins again.
  const picked = clicked && clicked.from === current ? clicked.index : current

  // Place the pill under the picked tab by writing its style directly: a measurement of
  // the DOM, not React state, so nothing re-renders.
  useLayoutEffect(() => {
    const bar = nav.current
    const link = bar?.querySelectorAll('a')[picked]
    const element = pill.current
    if (!bar || !link || !element) return
    // The first placement jumps into place; only later moves slide.
    const first = !bar.dataset.pill
    if (first) element.style.transition = 'none'
    element.style.transform = `translateX(${link.offsetLeft}px)`
    element.style.width = `${link.offsetWidth}px`
    bar.dataset.pill = 'on'
    if (first) {
      void element.offsetWidth
      element.style.transition = ''
    }
  }, [picked])

  return <nav className="tn-tabs" aria-label={label} ref={nav}>
    <span className="tn-tabs-pill" aria-hidden="true" ref={pill} />
    {items.map((item, index) => <Link aria-current={item.active ? 'page' : undefined} className={index === picked ? 'is-on' : ''} href={item.href} key={item.href} onClick={() => setClicked({ index, from: current })}>{item.text}</Link>)}
  </nav>
}
