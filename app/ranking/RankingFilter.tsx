'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const POSITIONS = ['FW', 'MF', 'DF', 'GK']

export default function RankingFilter({ provinces, currentProvince, currentPosition }: {
  provinces: string[]
  currentProvince: string
  currentPosition: string
}) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    router.push(`/ranking?${params.toString()}`)
  }

  return (
    <div style={{ padding: '14px 16px 0' }}>
      {/* POSITION FILTER */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>ตำแหน่ง</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => updateFilter('position', '')}
            style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: !currentPosition ? '#CC0001' : '#e5e5e5', background: !currentPosition ? '#CC0001' : 'white', color: !currentPosition ? 'white' : '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-barlow)', letterSpacing: 0.5 }}
          >
            ทั้งหมด
          </button>
          {POSITIONS.map(pos => (
            <button
              key={pos}
              onClick={() => updateFilter('position', pos === currentPosition ? '' : pos)}
              style={{ padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: currentPosition === pos ? '#CC0001' : '#e5e5e5', background: currentPosition === pos ? '#CC0001' : 'white', color: currentPosition === pos ? 'white' : '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-barlow)', letterSpacing: 0.5 }}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      {/* PROVINCE FILTER */}
      <div style={{ marginBottom: 4 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#aaa', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 }}>จังหวัด</div>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, scrollbarWidth: 'none' }}>
          <button
            onClick={() => updateFilter('province', '')}
            style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: !currentProvince ? '#CC0001' : '#e5e5e5', background: !currentProvince ? '#CC0001' : 'white', color: !currentProvince ? 'white' : '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
          >
            ทั้งหมด
          </button>
          {provinces.map(prov => (
            <button
              key={prov}
              onClick={() => updateFilter('province', prov === currentProvince ? '' : prov)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 20, border: '1.5px solid', borderColor: currentProvince === prov ? '#CC0001' : '#e5e5e5', background: currentProvince === prov ? '#CC0001' : 'white', color: currentProvince === prov ? 'white' : '#555', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {prov}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}