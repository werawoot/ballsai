import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { BookOpenCheck, CalendarRange, ChevronRight, Search, Trophy, type LucideIcon } from 'lucide-react'
import type { HomeKind, RoleHome, RoleStats } from '@/lib/role-home'


// The top of "ของฉัน" for everyone who is not (only) an athlete: what this role is looking at,
// the one thing to do now as the only primary button, and at most three shortcuts below it.
type Kind = Exclude<HomeKind, 'athlete'>

// Tools reuse a few action keys that also appear as plain rows; their tile words have their own key.
const TOOL_WORDS: Record<string, string> = { findAthletes: 'findAthletesTool', findTournament: 'findTournamentTool' }
const TOOL_ICONS: Record<string, LucideIcon> = { drills: BookOpenCheck, programmes: CalendarRange, findAthletes: Search, findTournament: Trophy }

export default function RoleHomeCard({ kind, home, stats }: { kind: Kind; home: RoleHome; stats?: RoleStats }) {
  // Which messages exist depends on the action (only primary ones have a title and text), so the keys are looked up by name.
  const t = useTranslations('roleHome') as unknown as (key: string, values?: Record<string, string | number>) => string
  const count = { count: home.primary.count ?? 0 }
  const primary = home.primary.key
  return <>
    <section className={`pf-card rh${home.tools ? ' is-now' : ''}`} aria-labelledby="rh-title">
      <p className="rh-eyebrow">{home.tools ? t('useNow') : t(`kinds.${kind}`)}</p>
      <h2 id="rh-title" className="rh-title">{t(`actions.${primary}.title`, count)}</h2>
      <p className="rh-text">{t(`actions.${primary}.text`)}</p>
      {stats && <p className="rh-stats">{t(`stats.${stats.key}`, stats.values)}</p>}
      <Link href={home.primary.href} className="pf-btn pf-btn-primary pf-btn-block">{t(`actions.${primary}.label`, count)}<ChevronRight size={17} aria-hidden="true" /></Link>
    </section>
    {home.tools && <ul className="rh-tools" aria-label={t('useNow')}>
      {home.tools.map(tool => {
        const Icon = TOOL_ICONS[tool.key] ?? ChevronRight
        const words = TOOL_WORDS[tool.key] ?? tool.key
        return <li key={tool.key}><Link href={tool.href} className="rh-tool">
          <span className={`rh-tool-icon is-${tool.key}`} aria-hidden="true"><Icon size={19} /></span>
          <b>{t(`actions.${words}.label`)}</b>
          <small>{t(`actions.${words}.hint`)}</small>
        </Link></li>
      })}
    </ul>}
    {home.next && <Link href={home.next.href} className="rh-next">
      <span>{t('nextStep')}</span>
      <b>{t(`actions.${home.next.key}.label`)}</b>
    </Link>}
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
