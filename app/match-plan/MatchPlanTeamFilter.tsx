import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import type { MatchPlanScope } from '@/lib/match-plan-teams'

// Which teams /match-plan offers: the ones this coach created, or the ones entered in
// tournaments they organize, searchable by name. Links and a plain GET form, so it works
// before any script loads. Not async, like Pagination. Styled by match-plan.css.
export default function MatchPlanTeamFilter({ scope, search, showScopes = true }: { scope: MatchPlanScope; search: string; showScopes?: boolean }) {
  const t = useTranslations('matchPlan')
  const tab = (value: MatchPlanScope, label: string) => {
    const active = scope === value
    return <Link href={`/match-plan?scope=${value}`} aria-current={active ? 'page' : undefined} className={active ? 'is-on' : undefined}>{label}</Link>
  }
  return (
    <div className="mp-filterbar">
      {showScopes && <nav aria-label={t('scopeLabel')} className="mp-scopes">
        {tab('mine', t('scopeMine'))}
        {tab('organized', t('scopeOrganized'))}
      </nav>}
      <form action="/match-plan" method="get" role="search" className="mp-teamsearch">
        <input type="hidden" name="scope" value={scope} />
        <label htmlFor="match-plan-team-search" className="mp-sr">{t('searchLabel')}</label>
        <input id="match-plan-team-search" name="q" defaultValue={search} placeholder={t('searchPlaceholder')} />
        <button type="submit"><Search size={15} aria-hidden="true" />{t('searchButton')}</button>
      </form>
    </div>
  )
}
