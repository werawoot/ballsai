'use client'

import { useState } from 'react'
import { Check, Share2 } from 'lucide-react'
import { track } from '@vercel/analytics'
import { useTranslations } from 'next-intl'

// The one primary action on a public profile: share this page. The phone's share sheet
// where there is one, otherwise the link goes to the clipboard.
export default function ShareProfileButton({ name }: { name: string }) {
  const t = useTranslations('player')
  const [note, setNote] = useState('')

  const share = async () => {
    const url = window.location.href.split('#')[0]
    try {
      if (navigator.share) {
        await navigator.share({ title: name, text: t('shareText', { name }), url })
        track('athlete_profile_shared', { method: 'native_share', from: 'public_profile' })
        return
      }
      await navigator.clipboard.writeText(url)
      track('athlete_profile_shared', { method: 'clipboard_fallback', from: 'public_profile' })
      setNote(t('shareCopied'))
    } catch (error) {
      if ((error as Error).name !== 'AbortError') setNote(t('shareFailed'))
    }
  }

  return <>
    <button className="ui-btn ui-btn-primary pp-share" onClick={share} type="button">{note === t('shareCopied') ? <Check size={18} aria-hidden="true" /> : <Share2 size={18} aria-hidden="true" />}{t('share')}</button>
    {note && <p className="pp-share-note" role="status">{note}</p>}
  </>
}
