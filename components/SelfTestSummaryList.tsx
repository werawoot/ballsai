import Link from 'next/link'
import type { getTranslations } from 'next-intl/server'
import { selfTestHistoryPath, selfTestSummary, SELF_TEST_KEYS, SELF_TESTS, type SelfTestResult } from '@/lib/training/self-tests'

// The latest result of each self-test and the change from the one before, for the athlete's
// /progress (with links to each history) and an accepted guardian's view of their child (read
// only). `t` is the selfTests translator; `lower` words a drop for this reader.

type Translate = Awaited<ReturnType<typeof getTranslations<'selfTests'>>>

export default function SelfTestSummaryList({ rows, today, t, day, lower, historyLinks = false }: {
  rows: SelfTestResult[]
  today: string
  t: Translate
  day: (value: string) => string
  lower: (amount: string) => string
  historyLinks?: boolean
}) {
  return <ul className="pf-list">
    {SELF_TEST_KEYS.map(key => {
      const summary = selfTestSummary(rows, key, today)
      const unit = t(`units.${SELF_TESTS[key].unit}`)
      const change = summary.change
      return <li key={key}><div className="pf-list-main">
        <b>{t(`tests.${key}.name`)}</b>
        <span>{summary.latest ? t('latest', { value: `${summary.latest.value} ${unit}`, date: day(summary.latest.test_date) }) : t('none')}</span>
        {change !== null && <span>{change > 0 ? t('better', { amount: `${change} ${unit}` }) : change < 0 ? lower(`${-change} ${unit}`) : t('same')}</span>}
        {historyLinks && summary.latest && <Link href={selfTestHistoryPath(key)}>{t('history.open')}</Link>}
      </div></li>
    })}
  </ul>
}
