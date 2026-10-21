'use client'

import { useRef } from 'react'
import { ChevronRight } from 'lucide-react'

// The month pills scroll sideways on a narrow screen; the arrow moves them along for a
// mouse user who has no sideways scroll. Each pill is a plain link to its month below.
export default function MonthPills({ label, moreLabel, months }: { label: string; moreLabel: string; months: Array<{ id: string; label: string }> }) {
  const row = useRef<HTMLDivElement>(null)
  return <nav className="tn-months" aria-label={label}>
    <div className="tn-months-row" ref={row}>
      {months.map((month, index) => <a className={index === 0 ? 'is-on' : ''} href={`#${month.id}`} key={month.id}>{month.label}</a>)}
    </div>
    <button type="button" className="tn-months-more" aria-label={moreLabel} onClick={() => row.current?.scrollBy({ left: 240, behavior: 'smooth' })}>
      <ChevronRight size={18} aria-hidden="true" />
    </button>
  </nav>
}
