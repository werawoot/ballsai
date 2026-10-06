'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { Shuffle } from 'lucide-react'
import { useApiErrorText } from '@/lib/use-api-error-text'

type Format = 'knockout' | 'league' | 'groups'

// Chooses a format and asks the server to make the draw. The server builds the fixtures
// from the confirmed teams; this form only sends the choice.
export default function FixtureDrawForm({ tournamentId, hasDraw, locked }: { tournamentId: string; hasDraw: boolean; locked: boolean }) {
  const t = useTranslations('fixtures')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [format, setFormat] = useState<Format>('knockout')
  const [groupCount, setGroupCount] = useState(2)
  const [advancePerGroup, setAdvancePerGroup] = useState(2)
  const [order, setOrder] = useState<'random' | 'registration'>('random')
  const [saving, setSaving] = useState(false)
  // Redrawing replaces the whole current draw, so it asks once before it does.
  const [confirming, setConfirming] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const submit = async () => {
    setSaving(true)
    setMessage(null)
    const response = await fetch(`/api/tournaments/${tournamentId}/fixtures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(format === 'groups' ? { format, order, groupCount, advancePerGroup } : { format, order }),
    }).catch(() => null)
    const body = await response?.json().catch(() => null)
    if (response?.ok) {
      setMessage({ ok: true, text: t('saved', { count: body?.count ?? 0 }) })
      router.refresh()
    } else {
      setMessage({ ok: false, text: errorText(body, t('loadFailed')) })
    }
    setSaving(false)
  }

  const field = { width: '100%', minHeight: 44, border: '1.5px solid #e5e5e5', borderRadius: 10, padding: '0 12px', fontSize: 14, fontFamily: 'var(--font-sarabun)', background: '#fafafa', boxSizing: 'border-box' } as const
  const label = { display: 'block', fontSize: 11, fontWeight: 700, color: '#888', margin: '12px 0 5px', textTransform: 'uppercase' } as const

  if (locked) return <p role="status" style={{ background: '#fef9c3', color: '#854d0e', borderRadius: 10, padding: '12px 14px', fontSize: 13, margin: 0 }}>{t('locked')}</p>

  return (
    <div style={{ background: 'white', borderRadius: 14, border: '1.5px solid #e5e5e5', padding: 16 }}>
      <label htmlFor="fixture-format" style={{ ...label, marginTop: 0 }}>{t('format')}</label>
      <select id="fixture-format" value={format} onChange={event => setFormat(event.target.value as Format)} style={field}>
        <option value="knockout">{t('knockout')}</option>
        <option value="league">{t('league')}</option>
        <option value="groups">{t('groups')}</option>
      </select>

      {format === 'groups' && <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label htmlFor="fixture-group-count" style={label}>{t('groupCount')}</label>
          <select id="fixture-group-count" value={groupCount} onChange={event => setGroupCount(Number(event.target.value))} style={field}>
            {Array.from({ length: 15 }, (_, index) => index + 2).map(count => <option key={count} value={count}>{count}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="fixture-advance" style={label}>{t('advancePerGroup')}</label>
          <select id="fixture-advance" value={advancePerGroup} onChange={event => setAdvancePerGroup(Number(event.target.value))} style={field}>
            <option value={1}>1</option>
            <option value={2}>2</option>
          </select>
        </div>
      </div>}

      <label htmlFor="fixture-order" style={label}>{t('order')}</label>
      <select id="fixture-order" value={order} onChange={event => setOrder(event.target.value as 'random' | 'registration')} style={field}>
        <option value="random">{t('orderRandom')}</option>
        <option value="registration">{t('orderRegistration')}</option>
      </select>

      {hasDraw && confirming
        ? <div role="alertdialog" aria-label={t('recreate')} style={{ marginTop: 16, display: 'grid', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#9b1d27', fontWeight: 700 }}>{t('recreateConfirm')}</p>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => { setConfirming(false); void submit() }} disabled={saving}>
            <Shuffle size={16} aria-hidden="true" />{saving ? t('saving') : t('recreate')}
          </button>
          <button type="button" className="ui-btn ui-btn-ghost" onClick={() => setConfirming(false)}>{t('recreateCancel')}</button>
        </div>
        : <button type="button" className={`ui-btn ${hasDraw ? 'ui-btn-ghost' : 'ui-btn-primary'}`} style={{ marginTop: 16 }} onClick={() => (hasDraw ? setConfirming(true) : void submit())} disabled={saving}>
          <Shuffle size={16} aria-hidden="true" />{saving ? t('saving') : hasDraw ? t('recreate') : t('create')}
        </button>}
      {message && <p role={message.ok ? 'status' : 'alert'} style={{ margin: '12px 0 0', fontSize: 13, color: message.ok ? '#166534' : '#9b1d27' }}>{message.text}</p>}
    </div>
  )
}
