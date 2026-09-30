'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Send } from 'lucide-react'

// The guardian step is where young athletes stop (docs/user-flows.md). This only helps them
// reach their guardian: it shares a sign-in link that lands on /guardian, with their account
// email to enter there. Consent itself is unchanged — the guardian still requests the link
// and confirms consent, and the athlete accepts (sql/21, request_guardian_link).
export default function GuardianInviteButton({ email }: { email: string }) {
  const t = useTranslations('profileHome.guardianInvite')
  const [status, setStatus] = useState('')

  const share = async () => {
    const url = `${window.location.origin}/login?next=${encodeURIComponent('/guardian')}`
    const text = t('text', { email })
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BallDoenSai', text, url })
        return
      }
      await navigator.clipboard.writeText(`${text}\n${url}`)
      setStatus(t('copied'))
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setStatus(t('failed'))
    }
  }

  return <>
    <button type="button" className="pf-btn pf-btn-primary pf-btn-block" onClick={share}><Send size={17} aria-hidden="true" />{t('button')}</button>
    <p className="pf-next-how">{t('how')}</p>
    {status && <p className="pf-next-status" role="status">{status}</p>}
  </>
}
