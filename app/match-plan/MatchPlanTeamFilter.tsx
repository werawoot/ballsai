import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Search } from 'lucide-react'
import type { MatchPlanScope } from '@/lib/match-plan-teams'

// Which teams /match-plan offers: the ones this coach created, or the ones entered in
// tournaments they organize, searchable by name. Links and a plain GET form, so it works
// before any script loads. Not async, like Pagination.
export default function MatchPlanTeamFilter({ scope, search }: { scope: MatchPlanScope; search: string }) {
  const t = useTranslations('matchPlan')
  const tab = (value: MatchPlanScope, label: string) => {
    const active = scope === value
    return <Link href={`/match-plan?scope=${value}`} aria-current={active ? 'page' : undefined} style={{ flex: '1 1 0', minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 44, padding: '0 10px', borderRadius: 999, background: active ? '#111827' : 'transparent', color: active ? 'white' : 'var(--ui-mute)', fontSize: 13, fontWeight: 800, textAlign: 'center', textDecoration: 'none', lineHeight: 1.2 }}>{label}</Link>
  }
  return (
    <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
      <nav aria-label={t('scopeLabel')} style={{ display: 'flex', gap: 4, padding: 4, borderRadius: 999, background: 'var(--ui-card)', border: '1px solid var(--ui-line)' }}>
        {tab('mine', t('scopeMine'))}
        {tab('organized', t('scopeOrganized'))}
      </nav>
      <form action="/match-plan" method="get" role="search" style={{ display: 'flex', gap: 8 }}>
        <input type="hidden" name="scope" value={scope} />
        <label htmlFor="match-plan-team-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('searchLabel')}</label>
        <input id="match-plan-team-search" name="q" defaultValue={search} placeholder={t('searchPlaceholder')} style={{ flex: 1, minWidth: 0, minHeight: 44, border: '1px solid var(--ui-line)', borderRadius: 10, padding: '0 12px', fontSize: 14, fontFamily: 'var(--font-sarabun)', background: 'var(--ui-card)' }} />
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 44, border: 0, borderRadius: 10, background: '#111827', color: 'white', padding: '0 12px', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-sarabun)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Search size={15} aria-hidden="true" />{t('searchButton')}
        </button>
      </form>
    </div>
  )
}
