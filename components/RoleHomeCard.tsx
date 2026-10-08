import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { ChevronRight } from 'lucide-react'
import type { HomeKind, RoleHome, RoleStats } from '@/lib/role-home'


// The top of "ของฉัน" for everyone who is not (only) an athlete: what this role is looking at,
// the one thing to do now as the only primary button, and at most three shortcuts below it.
type Kind = Exclude<HomeKind, 'athlete'>

export default function RoleHomeCard({ kind, home, stats }: { kind: Kind; home: RoleHome; stats?: RoleStats }) {
  // Which messages exist depends on the action (only primary ones have a title and text), so the keys are looked up by name.
  const t = useTranslations('roleHome') as unknown as (key: string, values?: Record<string, string | number>) => string
  const count = { count: home.primary.count ?? 0 }
  const primary = home.primary.key
  return <>
    <section className="pf-card rh" aria-labelledby="rh-title">
      <p className="rh-eyebrow">{t(`kinds.${kind}`)}</p>
      <h2 id="rh-title" className="rh-title">{t(`actions.${primary}.title`, count)}</h2>
      <p className="rh-text">{t(`actions.${primary}.text`)}</p>
      {stats && <p className="rh-stats">{t(`stats.${stats.key}`, stats.values)}</p>}
      <Link href={home.primary.href} className="pf-btn pf-btn-primary pf-btn-block">{t(`actions.${primary}.label`, count)}<ChevronRight size={17} aria-hidden="true" /></Link>
    </section>
    {home.rows.length > 0 && <section className="pf-card rh-rows" aria-label={t('more')}>
      <ul className="rh-list">
        {home.rows.map(row => <li key={row.key}>
          <Link href={row.href} className="rh-row">
            <span><b>{t(`actions.${row.key}.label`, { count: 0 })}</b>{row.key === 'myTeams' && <small>{t('actions.myTeams.hint')}</small>}</span>
            <ChevronRight size={17} aria-hidden="true" />
          </Link>
        </li>)}
      </ul>
    </section>}
  </>
}

export function RoleLoadFailed() {
  const t = useTranslations('roleHome')
  return <section className="pf-card rh" role="alert"><h2 className="rh-title">{t('loadFailed.title')}</h2><p className="rh-text">{t('loadFailed.text')}</p></section>
}
