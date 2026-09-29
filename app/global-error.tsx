'use client'

import { useEffect } from 'react'
import th from '@/messages/th.json'
import { reportClientError } from '@/lib/report-client-error'

// Shown only when the root layout itself fails, so no translation provider or site style
// is available: the Thai fallback text comes straight from messages/th.json.
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { reportClientError(error) }, [error])
  const text = th.fallback
  return (
    <html lang="th">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#080f1e', color: '#fff', fontFamily: 'system-ui, sans-serif', padding: 24, textAlign: 'center' }}>
        <main>
          <p style={{ color: '#f5c518', fontSize: 12, letterSpacing: 2, fontWeight: 800 }}>BALLDOENSAI.COM</p>
          <h1 style={{ fontSize: 32, margin: '8px 0' }}>{text.errorTop} {text.errorBottom}</h1>
          <p style={{ color: 'rgba(255,255,255,.72)', maxWidth: 420 }}>{text.errorBody}</p>
          <button type="button" onClick={reset} style={{ marginTop: 16, background: '#CC0001', color: '#fff', border: 0, minHeight: 44, padding: '0 20px', fontWeight: 800, cursor: 'pointer' }}>{text.retry}</button>
        </main>
      </body>
    </html>
  )
}
