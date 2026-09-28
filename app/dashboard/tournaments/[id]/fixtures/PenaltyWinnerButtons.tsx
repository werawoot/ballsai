'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useApiErrorText } from '@/lib/use-api-error-text'

// A drawn knockout match: the organizer names who went through on penalties. The
// database checks the rest (sql/56 set_fixture_winner_safely).
export default function PenaltyWinnerButtons({ tournamentId, fixtureKey, teams }: {
  tournamentId: string
  fixtureKey: string
  teams: { id: string; name: string }[]
}) {
  const t = useTranslations('fixtures')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  const choose = async (winnerTeamId: string) => {
    setSaving(winnerTeamId)
    setError('')
    const response = await fetch(`/api/tournaments/${tournamentId}/fixtures/winner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fixtureKey, winnerTeamId }),
    }).catch(() => null)
    if (response?.ok) router.refresh()
    else setError(errorText(await response?.json().catch(() => null), t('loadFailed')))
    setSaving('')
  }

  return (
    <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 6 }}>
      <p style={{ margin: 0, fontSize: 12, color: '#854d0e', fontWeight: 700 }}>{t('chooseWinner')}</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {teams.map(team => (
          <button key={team.id} type="button" disabled={Boolean(saving)} onClick={() => void choose(team.id)}
            style={{ flex: '1 1 120px', minHeight: 44, border: '1.5px solid #CC0001', borderRadius: 10, background: saving === team.id ? '#CC0001' : 'white', color: saving === team.id ? 'white' : '#CC0001', fontSize: 13, fontWeight: 800, fontFamily: 'var(--font-sarabun)', cursor: saving ? 'wait' : 'pointer', overflowWrap: 'anywhere' }}>
            {t('winnerButton', { team: team.name })}
          </button>
        ))}
      </div>
      {error && <p role="alert" style={{ margin: 0, fontSize: 12, color: '#9b1d27' }}>{error}</p>}
    </div>
  )
}
