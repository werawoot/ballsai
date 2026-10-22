'use client'

import { useState } from 'react'
import { Share2 } from 'lucide-react'

// Shares this tournament's page: the phone's share sheet where there is one (LINE,
// Messenger), else the link is copied. Only the public page address is shared.
export default function ShareButton({ title, label, copiedLabel }: { title: string; label: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false)
  const share = async () => {
    const url = window.location.href.split('?')[0]
    try {
      if (navigator.share) await navigator.share({ title, url })
      else {
        await navigator.clipboard.writeText(url)
        setCopied(true)
        window.setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // The person closed the share sheet: nothing to do.
    }
  }
  return <button className="gl-btn gl-btn-secondary tn-d-share" type="button" onClick={share}>
    <Share2 size={18} aria-hidden="true" />
    <span aria-live="polite">{copied ? copiedLabel : label}</span>
  </button>
}
