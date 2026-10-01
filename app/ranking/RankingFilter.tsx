'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Search } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { provinceName } from '@/lib/thai-provinces'

const POSITIONS = ['FW', 'MF', 'DF', 'GK'] as const

// Search, province and position on one row. A filter change starts again from page 1.
// The search waits until typing pauses, so a name is one request, not one per letter.
export default function RankingFilter({ provinces, currentProvince, currentPosition, currentSearch }: {
  provinces: string[]
  currentProvince: string
  currentPosition: string
  currentSearch: string
}) {
  const router = useRouter()
  const t = useTranslations('filters')
  const positions = useTranslations('player.positions')
  const locale = useLocale()
  const searchParams = useSearchParams()
  const [search, setSearch] = useState(currentSearch)
  const first = useRef(true)

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    params.delete('page')
    const query = params.toString()
    router.replace(`/ranking${query ? `?${query}` : ''}`)
  }

  // A link elsewhere on the page (clear filters) changes the URL: follow it.
  useEffect(() => { setSearch(value => value.trim() === currentSearch ? value : currentSearch) }, [currentSearch])

  useEffect(() => {
    if (first.current) { first.current = false; return }
    const timer = setTimeout(() => { if (search.trim() !== currentSearch) updateFilter('search', search.trim()) }, 400)
    return () => clearTimeout(timer)
    // updateFilter reads the current URL each time; only the typed text should re-arm it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  return <div className="rk-filters">
    <label className="rk-search">
      <Search size={16} aria-hidden="true" />
      <input aria-label={t('searchAthletes')} onChange={event => setSearch(event.target.value)} placeholder={t('searchAthletes')} type="search" value={search} />
    </label>
    <select aria-label={t('province')} className="rk-select" onChange={event => updateFilter('province', event.target.value)} value={currentProvince}>
      <option value="">{t('allProvinces')}</option>
      {provinces.map(item => <option key={item} value={item}>{provinceName(item, locale)}</option>)}
    </select>
    <select aria-label={t('position')} className="rk-select" onChange={event => updateFilter('position', event.target.value)} value={currentPosition}>
      <option value="">{t('allPositions')}</option>
      {POSITIONS.map(item => <option key={item} value={item}>{positions(item)}</option>)}
    </select>
  </div>
}
