'use client'

import Link from 'next/link'
import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { reportClientError } from '@/lib/report-client-error'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useTranslations('fallback')
  useEffect(() => {
    console.error('Unhandled application error', error)
    reportClientError(error)
  }, [error])

  return (
    <main className="site-fallback">
      <p className="site-fallback-kicker">BALLDOENSAI.COM · SYSTEM NOTICE</p>
      <h1>{t('errorTop')}<br /><em>{t('errorBottom')}</em></h1>
      <p>{t('errorBody')}</p>
      <div className="site-fallback-actions">
        <button type="button" onClick={reset}>{t('retry')}</button>
        <Link href="/">{t('home')}</Link>
      </div>
    </main>
  )
}
