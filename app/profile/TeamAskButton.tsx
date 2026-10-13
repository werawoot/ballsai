'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { Send } from 'lucide-react'

// An athlete with no team (report 10, mockup v10-3): a coach invites by the email the athlete
// signed up with (/team-members). This only helps the athlete hand that email to their coach;
// joining still needs the coach's invitation and the athlete's own "accept".
export default function TeamAskButton({ email }: { email: string }) {
  const t = useTranslations('profileHome.teamAsk')
  const [status, setStatus] = useState('')

  const share = async () => {
    const text = t('text', { email })
    try {
      if (navigator.share) {
        await navigator.share({ title: 'BallDoenSai', text })
        return
      }
      await navigator.clipboard.writeText(text)
      setStatus(t('copied'))
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setStatus(t('failed'))
    }
  }

  return <>
    <button type="button" className="pf-btn pf-btn-line pf-btn-sm" onClick={share}><Send size={15} aria-hidden="true" />{t('button')}</button>
    {status && <p className="pf-next-status" role="status">{status}</p>}
  </>
}
