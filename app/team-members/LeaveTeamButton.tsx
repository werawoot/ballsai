'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import ConfirmButton from '@/components/ConfirmButton'
import { useApiErrorText } from '@/lib/use-api-error-text'
import { postTeamJoin } from '@/lib/team-join'

// Leave a coach's own team (ADR-011): the athlete, or an accepted guardian for a child. The
// membership is kept as "left", so the athlete may ask to join again later.
export default function LeaveTeamButton({ memberId, teamName, childName }: { memberId: string; teamName: string; childName?: string | null }) {
  const t = useTranslations('teamJoin')
  const errorText = useApiErrorText()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const leave = async () => {
    if (busy) return
    setBusy(true); setError('')
    const result = await postTeamJoin('leave', { memberId })
    setBusy(false)
    if (!result.ok) { setError(errorText(result.body, t('leaveFailed'))); return }
    router.refresh()
  }
  return <>
    <ConfirmButton label={busy ? t('leaving') : t('leave')} disabled={busy} onConfirm={leave}
      question={childName ? t('leaveChildQuestion', { team: teamName, name: childName }) : t('leaveQuestion', { team: teamName })} />
    {error && <p className="tp-alert" role="alert">{error}</p>}
  </>
}
