'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { provinceName } from '@/lib/thai-provinces'

export default function AthleteFilters({
  provinces,
  currentSearch,
  currentProvince,
  currentPosition,
  currentAge,
}: {
  provinces: string[]
  currentSearch: string
  currentProvince: string
  currentPosition: string
  currentAge: string
}) {
  const router = useRouter()
  const t = useTranslations('filters')
  const locale = useLocale()
  const searchParams = useSearchParams()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    // A new filter is a new list: start it from its first page.
    params.delete('page')
    router.replace(`/athletes?${params.toString()}`)
  }

  return (
    <div className="at-filters">
      <label className="at-search">
        <Search size={17} aria-hidden="true" />
        <input aria-label={t('searchAthleteName')} defaultValue={currentSearch} onChange={event => update('search', event.target.value)} placeholder={t('searchAthleteName')} type="search" />
      </label>
      <div className="at-selects">
        <SlidersHorizontal size={18} aria-hidden="true" />
        <select aria-label={t('province')} className="at-select" value={currentProvince} onChange={event => update('province', event.target.value)}><option value="">{t('allProvinces')}</option>{provinces.map(province => <option key={province} value={province}>{provinceName(province, locale)}</option>)}</select>
        <select aria-label={t('position')} className="at-select" value={currentPosition} onChange={event => update('position', event.target.value)}><option value="">{t('allPositions')}</option>{['FW', 'MF', 'DF', 'GK'].map(position => <option key={position} value={position}>{position}</option>)}</select>
        <select aria-label={t('age')} className="at-select" value={currentAge} onChange={event => update('age', event.target.value)}><option value="">{t('allAges')}</option><option value="u12">U12</option><option value="u15">U15</option><option value="u18">U18</option><option value="adult">20+</option></select>
      </div>
    </div>
  )
}
