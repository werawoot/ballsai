'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Search, SlidersHorizontal } from 'lucide-react'

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
  const searchParams = useSearchParams()

  const update = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) params.set(key, value)
    else params.delete(key)
    router.replace(`/athletes?${params.toString()}`)
  }

  const selectStyle = {
    minWidth: 0,
    minHeight: 42,
    border: '1px solid #ddd',
    borderRadius: 6,
    background: 'white',
    padding: '0 10px',
    color: '#333',
    fontFamily: 'var(--font-sarabun)',
    fontSize: 12,
    fontWeight: 700,
  } as const

  return (
    <div style={{ padding: '14px 16px', borderBottom: '1px solid #e4e4e1', background: '#f7f7f5' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ position: 'relative', marginBottom: 9 }}>
          <Search size={17} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#888' }} />
          <input defaultValue={currentSearch} onChange={event => update('search', event.target.value)} placeholder="ค้นหาชื่อนักกีฬา..." style={{ width: '100%', minHeight: 44, border: '1px solid #d8d8d5', borderRadius: 6, padding: '0 12px 0 38px', background: 'white', fontFamily: 'var(--font-sarabun)', fontSize: 14, outline: 'none' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '28px repeat(3,minmax(0,1fr))', gap: 7, alignItems: 'center' }}>
          <SlidersHorizontal size={18} color="#777" />
          <select aria-label="จังหวัด" value={currentProvince} onChange={event => update('province', event.target.value)} style={selectStyle}><option value="">ทุกจังหวัด</option>{provinces.map(province => <option key={province} value={province}>{province}</option>)}</select>
          <select aria-label="ตำแหน่ง" value={currentPosition} onChange={event => update('position', event.target.value)} style={selectStyle}><option value="">ทุกตำแหน่ง</option>{['FW', 'MF', 'DF', 'GK'].map(position => <option key={position} value={position}>{position}</option>)}</select>
          <select aria-label="ช่วงอายุ" value={currentAge} onChange={event => update('age', event.target.value)} style={selectStyle}><option value="">ทุกช่วงอายุ</option><option value="u12">U12</option><option value="u15">U15</option><option value="u18">U18</option><option value="adult">20+</option></select>
        </div>
      </div>
    </div>
  )
}
