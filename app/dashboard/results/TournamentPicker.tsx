import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { Check, Search } from 'lucide-react'
import Pagination from '@/components/Pagination'
import type { ResultTournament } from '@/lib/match-results-dashboard'

// The tournament a result is recorded for. One page of tournaments at a time with a name
// search, because an admin chooses from every tournament in the country. A plain GET form
// and links, so it works before any script loads. Not async, like Pagination.
export default function TournamentPicker({ tournaments, selectedId, page, hasNext, search }: {
  tournaments: ResultTournament[]
  selectedId: string
  page: number
  hasNext: boolean
  search: string
}) {
  const t = useTranslations('matchResults')
  const href = (id: string) => {
    const query = new URLSearchParams({ tournament: id })
    if (search) query.set('q', search)
    if (page > 1) query.set('page', String(page))
    return `/dashboard/results?${query.toString()}`
  }
  return (
    <section aria-labelledby="result-tournament-picker" style={{ background: 'var(--ui-card)', borderRadius: 14, border: '1.5px solid var(--ui-line)', padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
      <h2 id="result-tournament-picker" style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, fontWeight: 700, color: '#CC0001', textTransform: 'uppercase', margin: '0 0 12px' }}>{t('pickerTitle')}</h2>
      <form action="/dashboard/results" method="get" role="search" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <label htmlFor="result-tournament-search" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>{t('searchLabel')}</label>
        <input id="result-tournament-search" name="q" defaultValue={search} placeholder={t('searchPlaceholder')} style={{ flex: 1, minWidth: 0, minHeight: 44, border: '1.5px solid var(--ui-line)', borderRadius: 10, padding: '0 12px', fontSize: 14, fontFamily: 'var(--font-sarabun)', background: 'var(--ui-sunk)' }} />
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 44, minWidth: 44, border: 0, borderRadius: 10, background: '#111827', color: 'white', padding: '0 12px', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-sarabun)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
          <Search size={15} aria-hidden="true" />{t('searchButton')}
        </button>
      </form>
      {tournaments.length === 0
        ? <p style={{ fontSize: 13, color: 'var(--ui-mute)', margin: '8px 0' }}>{t('empty')}</p>
        : <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {tournaments.map(tournament => {
            const selected = tournament.id === selectedId
            return <li key={tournament.id}>
              <Link href={href(tournament.id)} aria-current={selected ? 'true' : undefined} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44, padding: '0 12px', borderRadius: 10, border: `1.5px solid ${selected ? '#CC0001' : '#eee'}`, background: selected ? 'var(--ui-sunk)' : 'var(--ui-card)', color: 'var(--ui-text)', fontSize: 14, fontWeight: selected ? 800 : 600, textDecoration: 'none' }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tournament.name}</span>
                {selected && <Check size={16} color="#CC0001" aria-hidden="true" />}
              </Link>
            </li>
          })}
        </ul>}
      <Pagination basePath="/dashboard/results" page={page} hasNext={hasNext} params={{ q: search, tournament: selectedId }} />
    </section>
  )
}
