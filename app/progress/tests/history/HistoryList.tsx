'use client'

import { useState } from 'react'
import type { SelfTestKey } from '@/lib/training/self-tests'
import DeleteResultButton from './DeleteResultButton'

// The rows of one self-test's history. A row leaves the list as soon as its delete succeeds, and
// the empty message shows once none is left, so neither waits on the page's refresh, which Next
// sometimes cancels (docs/e2e.md).
export type HistoryItem = { date: string; dateLabel: string; valueLabel: string }

export default function HistoryList({ test, items, emptyText }: { test: SelfTestKey; items: HistoryItem[]; emptyText: string }) {
  const [deleted, setDeleted] = useState<string[]>([])
  const rows = items.filter(item => !deleted.includes(item.date))
  if (rows.length === 0) return <p className="pf-card-desc">{emptyText}</p>
  return <ul className="pf-list st-history">
    {rows.map(item => <li key={item.date}>
      <div className="pf-list-main">
        <b>{item.valueLabel}</b>
        <span>{item.dateLabel}</span>
      </div>
      <DeleteResultButton test={test} date={item.date} dateLabel={item.dateLabel} onDeleted={() => setDeleted(done => [...done, item.date])} />
    </li>)}
  </ul>
}
