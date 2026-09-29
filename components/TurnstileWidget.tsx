'use client'

import { useEffect, useRef } from 'react'

// T19. Cloudflare Turnstile, rendered explicitly. A token is single-use and lives 300 s,
// so the parent bumps `resetSignal` after every auth request (sent, refused or failed)
// and the widget issues a fresh one. See docs/research/supabase-captcha-turnstile-2026-09-29.md.

type TurnstileApi = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

declare global {
  interface Window { turnstile?: TurnstileApi }
}

export const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let scriptLoad: Promise<TurnstileApi> | null = null

// Cloudflare asks that the script be loaded from its own URL, never bundled or proxied.
function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile)
  if (!scriptLoad) {
    scriptLoad = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = TURNSTILE_SCRIPT
      script.async = true
      script.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error('turnstile missing')))
      script.onerror = () => { scriptLoad = null; reject(new Error('turnstile load failed')) }
      document.head.appendChild(script)
    })
  }
  return scriptLoad
}

export default function TurnstileWidget({ siteKey, language, label, onToken, resetSignal }: {
  siteKey: string
  language: string
  label: string
  onToken: (token: string | null) => void
  resetSignal: number
}) {
  const container = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)
  // The latest callback, so the widget is rendered once and never re-created on re-render.
  const tokenHandler = useRef(onToken)
  useEffect(() => { tokenHandler.current = onToken }, [onToken])

  useEffect(() => {
    let cancelled = false
    loadTurnstile().then(api => {
      if (cancelled || !container.current) return
      widgetId.current = api.render(container.current, {
        sitekey: siteKey,
        language,
        size: 'flexible',
        callback: (token: string) => tokenHandler.current(token),
        'expired-callback': () => tokenHandler.current(null),
        'error-callback': () => tokenHandler.current(null),
      })
    }).catch(() => tokenHandler.current(null))
    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current)
      widgetId.current = null
      tokenHandler.current(null)
    }
  }, [siteKey, language])

  const firstSignal = useRef(resetSignal)
  useEffect(() => {
    if (resetSignal === firstSignal.current) return
    tokenHandler.current(null)
    if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current)
  }, [resetSignal])

  return <div aria-label={label} ref={container} role="group" style={{ margin: '14px 0 4px', minHeight: 65 }} />
}
