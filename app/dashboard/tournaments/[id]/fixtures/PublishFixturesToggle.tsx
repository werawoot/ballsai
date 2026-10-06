'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Eye, EyeOff } from 'lucide-react'
import { useApiErrorText } from '@/lib/use-api-error-text'

// Publishing shows team names, fixtures and results to everyone, so it is the
// organizer's explicit choice and can be undone. sql/57 checks who may.
export default function PublishFixturesToggle({ tournamentId, published }: { tournamentId: string; published: boolean }) {
  const t = useTranslations('fixtures')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const toggle = async () => {
    setSaving(true)
    setError('')
    const response = await fetch(`/api/tournaments/${tournamentId}/fixtures/publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !published }),
    }).catch(() => null)
    if (response?.ok) router.refresh()
    else setError(errorText(await response?.json().catch(() => null), t('loadFailed')))
    setSaving(false)
  }

  return (
    <section aria-label={t('publishTitle')} style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16, display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: 'var(--font-oswald)', fontSize: 15, margin: 0 }}>{t('publishTitle')}</h2>
        <span role="status" style={{ fontSize: 12, fontWeight: 800, borderRadius: 999, padding: '4px 10px', background: published ? '#dcfce7' : '#f1f1f1', color: published ? '#166534' : '#555' }}>
          {published ? t('publishedNow') : t('privateNow')}
        </span>
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#666', lineHeight: 1.5 }}>{t('publishHelp')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={`ui-btn ${published ? 'ui-btn-ghost' : 'ui-btn-primary'}`} onClick={() => void toggle()} disabled={saving} style={{ flex: '1 1 160px' }}>
          {published ? <EyeOff size={15} aria-hidden="true" /> : <Eye size={15} aria-hidden="true" />}{published ? t('publishOff') : t('publishOn')}
        </button>
        {published && <Link href={`/tournaments/${tournamentId}/fixtures`} style={{ flex: '1 1 140px', minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1.5px solid #e5e5e5', color: '#CC0001', fontSize: 13, fontWeight: 800, textDecoration: 'none' }}>{t('viewPublic')}</Link>}
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#9b1d27' }}>{error}</p>}
    </section>
  )
}
